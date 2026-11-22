/* Lecture / écriture dans le localStorage. */

import {
  AccountKey,
  Channel,
  MonthBudget,
  Operation,
  OperationKind,
  Reference,
  ReferenceKey,
  isCategory,
} from './models';
import { isISODate } from './utils';

const KEYS = {
  operations: 'operations',
  references: 'references',
  budgets: 'budgets',
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

function normalizeOperation(raw: unknown): Operation | null {
  if (!isRecord(raw)) return null;
  const amount = Number(raw['amount']);
  const { id, date, kind, account } = raw;
  if (typeof id !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;
  if (!isISODate(date) || !isOneOf(KINDS, kind) || !isOneOf(ACCOUNT_KEYS, account)) return null;

  const category = kind === 'depense' && isCategory(raw['category']) ? raw['category'] : null;
  if (kind === 'depense' && category === null) return null;

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
  };
}

export function loadOperations(): Operation[] {
  const data = readJson(KEYS.operations);
  if (!Array.isArray(data)) return [];
  return data.map(normalizeOperation).filter((op): op is Operation => op !== null);
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

/** Soldes de référence de la banque et de MVola. */
export function loadReferences(): Record<ReferenceKey, Reference | null> {
  const data = readJson(KEYS.references);
  const raw = isRecord(data) ? data : {};
  return { banque: normalizeReference(raw['banque']), mvola: normalizeReference(raw['mvola']) };
}

export function saveReferences(references: Record<ReferenceKey, Reference | null>): void {
  save(KEYS.references, references);
}

/** Budgets par mois ("AAAA-MM"). */
export function loadBudgets(): Record<string, MonthBudget> {
  const data = readJson(KEYS.budgets);
  if (!isRecord(data)) return {};
  const budgets: Record<string, MonthBudget> = {};
  for (const [month, raw] of Object.entries(data)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !isRecord(raw) || !isRecord(raw['amounts'])) continue;
    const amounts: Record<string, number> = {};
    for (const [category, value] of Object.entries(raw['amounts'])) {
      const amount = Number(value);
      if (isCategory(category) && Number.isFinite(amount) && amount >= 0) amounts[category] = amount;
    }
    const edits = Number(raw['edits']);
    budgets[month] = { amounts, edits: Number.isInteger(edits) && edits > 0 ? edits : 0 };
  }
  return budgets;
}

export function saveBudgets(budgets: Record<string, MonthBudget>): void {
  save(KEYS.budgets, budgets);
}
