/* Lecture / écriture dans le localStorage. */

import {
  AccountKey,
  Channel,
  DEFAULT_FUEL_PRICE,
  Deletions,
  FuelPrice,
  MonthBudget,
  MotoReading,
  Operation,
  OperationKind,
  Reference,
  ReferenceKey,
  ReferenceTimes,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  Category,
  CategoryRemovals,
  isCategoryName,
} from './models';
import { isISODate } from './utils';

const KEYS = {
  operations: 'operations',
  references: 'references',
  budgets: 'budgets',
  deleted: 'deletedOps',
  referenceTimes: 'referencesUpdatedAt',
  categories: 'customCategories',
  categoryRemovals: 'categoryRemovals',
  moto: 'motoReadings',
  motoDeleted: 'motoDeleted',
  fuelPrice: 'fuelPrice',
} as const;

/** Clés de l'ancienne version (dépenses à catégories libres), effacées au premier lancement. */
const OLD_KEYS = ['expenses', 'incomes', 'paymentMode', 'bankReference', 'monthlyBudget'];

const KINDS: readonly OperationKind[] = ['depense', 'revenu', 'retrait-banque', 'depot-mvola', 'retrait-mvola'];
const ACCOUNT_KEYS: readonly AccountKey[] = ['banque', 'cash', 'mvola'];
const CHANNELS: readonly Channel[] = ['especes', 'achat-en-ligne', 'virement', 'transfert', 'frais'];

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null;
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return list.includes(value as T);
}

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch (err) {
    console.error('Lecture du stockage impossible :', err);
    return null;
  }
}

/** Appelé quand une sauvegarde échoue (l'application affiche alors un message). */
let onSaveError: (() => void) | undefined;

export function setSaveErrorHandler(handler: () => void): void {
  onSaveError = handler;
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Sauvegarde impossible :', err);
    onSaveError?.();
  }
}

export function clearOldData(): void {
  try {
    for (const key of OLD_KEYS) localStorage.removeItem(key);
  } catch {
    // Stockage inaccessible : rien à effacer
  }
}

/** Nombre positif (kilométrage, litres), ou undefined */
function positive(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function normalizeOperation(raw: unknown): Operation | null {
  if (!isRecord(raw)) return null;
  const amount = Number(raw['amount']);
  const { id, date, kind, account } = raw;
  if (typeof id !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  if (!isISODate(date) || !isOneOf(KINDS, kind) || !isOneOf(ACCOUNT_KEYS, account)) return null;

  const category = kind === 'depense' && isCategoryName(raw['category']) ? raw['category'] : null;
  if (kind === 'depense' && category === null) return null;

  const photo = raw['photo'];
  const updatedAt = raw['updatedAt'];
  const odometer = positive(raw['odometer']);
  const fuelLeft = positive(raw['fuelLeft']);
  const fuelPrice = positive(raw['fuelPrice']);
  return {
    id,
    date,
    kind,
    account,
    amount,
    description: String(raw['description'] ?? ''),
    category,
    channel: isOneOf(CHANNELS, raw['channel']) ? raw['channel'] : null,
    parentId: typeof raw['parentId'] === 'number' ? raw['parentId'] : null,
    ...(typeof photo === 'string' && photo.startsWith('https://') ? { photo } : {}),
    ...(odometer !== undefined ? { odometer } : {}),
    ...(fuelLeft !== undefined ? { fuelLeft } : {}),
    ...(fuelPrice ? { fuelPrice } : {}),
    ...(typeof updatedAt === 'number' && updatedAt > 0 ? { updatedAt } : {}),
  };
}

/** Liste d'opérations venue du stockage ou du fichier de synchro (les lignes invalides sont ignorées) */
export function normalizeOperations(data: unknown): Operation[] {
  if (!Array.isArray(data)) return [];
  return data.map(normalizeOperation).filter((op): op is Operation => op !== null);
}

export function loadOperations(): Operation[] {
  return normalizeOperations(readJson(KEYS.operations));
}

export function saveOperations(operations: readonly Operation[]): void {
  save(KEYS.operations, operations);
}

function normalizeReference(raw: unknown): Reference | null {
  if (!isRecord(raw)) return null;
  const amount = Number(raw['amount']);
  if (!Number.isFinite(amount) || !isISODate(raw['date'])) return null;
  return { date: raw['date'], amount };
}

export function normalizeReferences(data: unknown): Record<ReferenceKey, Reference | null> {
  const raw = isRecord(data) ? data : {};
  return { banque: normalizeReference(raw['banque']), mvola: normalizeReference(raw['mvola']) };
}

/** Soldes de référence de la banque et de MVola. */
export function loadReferences(): Record<ReferenceKey, Reference | null> {
  return normalizeReferences(readJson(KEYS.references));
}

export function saveReferences(references: Record<ReferenceKey, Reference | null>): void {
  save(KEYS.references, references);
}

/** Budgets par mois ("AAAA-MM"). */
export function loadBudgets(): Record<string, MonthBudget> {
  return normalizeBudgets(readJson(KEYS.budgets));
}

export function normalizeBudgets(data: unknown): Record<string, MonthBudget> {
  if (!isRecord(data)) return {};
  const budgets: Record<string, MonthBudget> = {};
  for (const [month, raw] of Object.entries(data)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !isRecord(raw) || !isRecord(raw['amounts'])) continue;
    const amounts: Record<string, number> = {};
    for (const [category, value] of Object.entries(raw['amounts'])) {
      const amount = Number(value);
      if (isCategoryName(category) && Number.isFinite(amount) && amount >= 0) amounts[category] = amount;
    }
    const edits = Number(raw['edits']);
    const updatedAt = raw['updatedAt'];
    budgets[month] = {
      amounts,
      edits: Number.isInteger(edits) && edits > 0 ? edits : 0,
      ...(typeof updatedAt === 'number' && updatedAt > 0 ? { updatedAt } : {}),
    };
  }
  return budgets;
}

export function saveBudgets(budgets: Record<string, MonthBudget>): void {
  save(KEYS.budgets, budgets);
}

/** Nombres positifs rangés par clé (suppressions, dates de modification) */
function normalizeTimes(data: unknown): Record<string, number> {
  const times: Record<string, number> = {};
  if (!isRecord(data)) return times;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'number' && value > 0) times[key] = value;
  }
  return times;
}

export function normalizeDeletions(data: unknown): Deletions {
  return normalizeTimes(data);
}

export function loadDeletions(): Deletions {
  return normalizeDeletions(readJson(KEYS.deleted));
}

export function saveDeletions(deleted: Deletions): void {
  save(KEYS.deleted, deleted);
}

export function normalizeReferenceTimes(data: unknown): ReferenceTimes {
  const times = normalizeTimes(data);
  return { banque: times['banque'] ?? 0, mvola: times['mvola'] ?? 0 };
}

export function loadReferenceTimes(): ReferenceTimes {
  return normalizeReferenceTimes(readJson(KEYS.referenceTimes));
}

export function saveReferenceTimes(times: ReferenceTimes): void {
  save(KEYS.referenceTimes, times);
}

/** Catégories créées par l'utilisateur */
export function normalizeCategories(data: unknown): Category[] {
  if (!Array.isArray(data)) return [];
  const list: Category[] = [];
  for (const raw of data) {
    if (!isRecord(raw) || !isCategoryName(raw['name'])) continue;
    const name = raw['name'].trim();
    if (list.some((c) => c.name.toLowerCase() === name.toLowerCase())) continue;
    list.push({
      name,
      icon: isOneOf(CATEGORY_ICONS, raw['icon']) ? raw['icon'] : 'tag',
      color: isOneOf(CATEGORY_COLORS, raw['color']) ? raw['color'] : CATEGORY_COLORS[list.length % CATEGORY_COLORS.length],
    });
  }
  return list;
}

export function loadCategories(): Category[] {
  return normalizeCategories(readJson(KEYS.categories));
}

export function saveCategories(list: readonly Category[]): void {
  save(KEYS.categories, list);
}

export function normalizeCategoryRemovals(data: unknown): CategoryRemovals {
  const out: CategoryRemovals = {};
  if (!isRecord(data)) return out;
  for (const [name, raw] of Object.entries(data)) {
    if (!isRecord(raw) || typeof raw['removed'] !== 'boolean' || typeof raw['at'] !== 'number') continue;
    out[name.toLowerCase()] = { removed: raw['removed'], at: raw['at'] };
  }
  return out;
}

export function loadCategoryRemovals(): CategoryRemovals {
  return normalizeCategoryRemovals(readJson(KEYS.categoryRemovals));
}

export function saveCategoryRemovals(removals: CategoryRemovals): void {
  save(KEYS.categoryRemovals, removals);
}

/* ---------- Moto ---------- */

function normalizeReading(raw: unknown): MotoReading | null {
  if (!isRecord(raw) || typeof raw['id'] !== 'number' || !isISODate(raw['date'])) return null;
  const km = positive(raw['km']) ?? null;
  const fuelLeft = positive(raw['fuelLeft']) ?? null;
  const added = positive(raw['added']) || null;
  if (km === null && added === null) return null;
  const updatedAt = raw['updatedAt'];
  return {
    id: raw['id'],
    date: raw['date'],
    km,
    fuelLeft,
    added,
    ...(typeof updatedAt === 'number' && updatedAt > 0 ? { updatedAt } : {}),
  };
}

/** Relevés de la page Moto (les lignes invalides sont ignorées) */
export function normalizeReadings(data: unknown): MotoReading[] {
  if (!Array.isArray(data)) return [];
  return data.map(normalizeReading).filter((r): r is MotoReading => r !== null);
}

export function loadReadings(): MotoReading[] {
  return normalizeReadings(readJson(KEYS.moto));
}

export function saveReadings(readings: readonly MotoReading[]): void {
  save(KEYS.moto, readings);
}

export function loadReadingDeletions(): Deletions {
  return normalizeDeletions(readJson(KEYS.motoDeleted));
}

export function saveReadingDeletions(deleted: Deletions): void {
  save(KEYS.motoDeleted, deleted);
}

export function normalizeFuelPrice(data: unknown): FuelPrice {
  const price = isRecord(data) ? positive(data['price']) : undefined;
  const updatedAt = isRecord(data) ? positive(data['updatedAt']) : undefined;
  return price ? { price, updatedAt: updatedAt ?? 0 } : { price: DEFAULT_FUEL_PRICE, updatedAt: 0 };
}

export function loadFuelPrice(): FuelPrice {
  return normalizeFuelPrice(readJson(KEYS.fuelPrice));
}

export function saveFuelPrice(price: FuelPrice): void {
  save(KEYS.fuelPrice, price);
}
