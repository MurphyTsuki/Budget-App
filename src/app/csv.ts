/*
 * Export et lecture du fichier CSV de Volako.
 * Format pensé pour Excel en français : séparateur « ; », virgule décimale, encodage UTF-8 avec BOM.
 * Une seule feuille : les soldes de référence, le prix du litre et les budgets en haut,
 * puis les opérations et les relevés moto.
 */

import {
  ACCOUNTS,
  AccountKey,
  Channel,
  DEFAULT_FUEL_PRICE,
  FEES_CATEGORY,
  FUEL_CATEGORY,
  FuelPrice,
  MonthBudget,
  MotoReading,
  Operation,
  OperationKind,
  Reference,
  ReferenceKey,
  isCategoryName,
} from './models';
import { litersOf } from './moto';
import { pad2 } from './utils';

const HEADER = [
  'Type',
  'ID',
  'Date',
  'Heure',
  'Compte',
  'Catégorie',
  'Libellé',
  'Montant',
  'Frais',
  'Budget catégorie (mois)',
  'Photo',
  'Kilométrage',
  'Essence restante (L)',
  'Essence ajoutée (L)',
  'Prix du litre',
];

/** Types de ligne : le nom affiché dans le fichier et l'opération qu'il désigne. */
const OPERATION_TYPES: { label: string; kind: OperationKind; channel: Channel | null }[] = [
  { label: 'Dépense espèces', kind: 'depense', channel: 'especes' },
  { label: 'Achat en ligne', kind: 'depense', channel: 'achat-en-ligne' },
  { label: 'Virement bancaire', kind: 'depense', channel: 'virement' },
  { label: 'Transfert MVola', kind: 'depense', channel: 'transfert' },
  { label: 'Revenu', kind: 'revenu', channel: null },
  { label: 'Retrait bancaire', kind: 'retrait-banque', channel: null },
  { label: 'Dépôt MVola', kind: 'depot-mvola', channel: null },
  { label: 'Retrait MVola', kind: 'retrait-mvola', channel: null },
];
const BUDGET_TYPE = 'Budget';
const REFERENCE_TYPE = 'Solde de référence';
const FUEL_PRICE_TYPE = 'Prix du litre';
const READING_TYPE = 'Relevé moto';

/** Préfixe des identifiants : sans lui, Excel les transforme en 1,795E+12 et les abîme. */
const ID_PREFIX = 'V';

export interface VolakoData {
  operations: Operation[];
  references: Record<ReferenceKey, Reference | null>;
  budgets: Record<string, MonthBudget>;
  moto: MotoReading[];
  fuelPrice?: FuelPrice | null;
}

export interface ParsedCsv extends VolakoData {
  /** Nombre d'opérations lues (sans compter les lignes de frais recréées) */
  operationCount: number;
  budgetLines: number;
  readingCount: number;
  /** Premier et dernier mois présents dans le fichier */
  months: [string, string] | null;
  /** Lignes ignorées, avec la raison */
  errors: string[];
}

/* ---------- Export ---------- */

/** Montant pour Excel : virgule décimale, sans séparateur de milliers ("12000,5") */
function amountCell(n: number): string {
  return String(n).replace('.', ',');
}

/** Nombre facultatif (kilométrage, litres) */
function optionalCell(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : amountCell(n);
}

/** Heure de saisie, retrouvée à partir de l'identifiant (l'instant de création) */
function timeOf(id: number): string {
  const date = new Date(id);
  return Number.isNaN(date.getTime()) ? '' : `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function cell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function typeLabel(op: Operation): string {
  return OPERATION_TYPES.find((t) => t.kind === op.kind && (op.kind !== 'depense' || t.channel === op.channel))?.label
    ?? 'Dépense espèces';
}

export function exportCsv(data: VolakoData): string {
  const rows: string[][] = [HEADER];
  // Les lignes sans colonnes moto sont complétées par des cases vides
  const push = (row: string[]) => rows.push([...row, ...Array<string>(HEADER.length - row.length).fill('')]);
  const price = data.fuelPrice?.price ?? DEFAULT_FUEL_PRICE;

  for (const key of ['banque', 'mvola'] as const) {
    const ref = data.references[key];
    if (ref) push([REFERENCE_TYPE, '', ref.date, '', ACCOUNTS[key].name, '', '', amountCell(ref.amount)]);
  }
  if (data.fuelPrice) push([FUEL_PRICE_TYPE, '', '', '', '', '', 'Ar par litre', amountCell(price)]);

  for (const month of Object.keys(data.budgets).sort()) {
    const budget = data.budgets[month];
    const edits = `${budget.edits} modification${budget.edits > 1 ? 's' : ''} utilisée${budget.edits > 1 ? 's' : ''}`;
    for (const [category, amount] of Object.entries(budget.amounts)) {
      push([BUDGET_TYPE, '', month, '', '', category, edits, amountCell(amount)]);
    }
  }

  // Les frais MVola sont écrits sur la ligne de leur opération, pas sur une ligne à part
  const fees = new Map<number, number>();
  for (const op of data.operations) {
    if (op.parentId !== null) fees.set(op.parentId, op.amount);
  }
  const operations = data.operations
    .filter((op) => op.parentId === null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

  for (const op of operations) {
    const planned = op.category ? data.budgets[op.date.slice(0, 7)]?.amounts[op.category] : undefined;
    const fuel = op.kind === 'depense' && op.category === FUEL_CATEGORY;
    push([
      typeLabel(op),
      ID_PREFIX + op.id,
      op.date,
      timeOf(op.id),
      ACCOUNTS[op.account].name,
      op.category ?? '',
      op.description,
      amountCell(op.amount),
      fees.has(op.id) ? amountCell(fees.get(op.id)!) : '',
      planned === undefined ? '' : amountCell(planned),
      op.photo ?? '',
      optionalCell(op.odometer),
      optionalCell(op.fuelLeft),
      fuel ? amountCell(litersOf(op, price)) : '',
      optionalCell(op.fuelPrice),
    ]);
  }

  for (const r of [...data.moto].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    push([
      READING_TYPE, ID_PREFIX + r.id, r.date, timeOf(r.id), '', '', '', '', '', '', '',
      optionalCell(r.km), optionalCell(r.fuelLeft), optionalCell(r.added), '',
    ]);
  }

  // BOM : sans lui, Excel lit les accents de travers
  return '﻿' + rows.map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n';
}

/* ---------- Lecture ---------- */

/** Découpe le texte en lignes et cellules (guillemets et retours à la ligne gérés). */
function splitCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.slice(0, clean.indexOf('\n') === -1 ? undefined : clean.indexOf('\n'));
  // Excel en français écrit des « ; », d'autres logiciels des « , »
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === sep) {
      row.push(value);
      value = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && clean[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }
  if (value !== '' || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** "12 000,5" ou "12000.5" -> 12000.5 */
function parseAmountCell(text: string): number | null {
  const clean = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Date ISO, ou JJ/MM/AAAA si Excel l'a reformatée */
function parseDateCell(text: string): string | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return fr ? `${fr[3]}-${pad2(Number(fr[2]))}-${pad2(Number(fr[1]))}` : null;
}

/** Mois "AAAA-MM", ou MM/AAAA, ou une date complète */
function parseMonthCell(text: string): string | null {
  const t = text.trim();
  if (/^\d{4}-\d{2}$/.test(t)) return t;
  const fr = /^(\d{1,2})\/(\d{4})$/.exec(t);
  if (fr) return `${fr[2]}-${pad2(Number(fr[1]))}`;
  return parseDateCell(t)?.slice(0, 7) ?? null;
}

function accountOf(name: string): AccountKey | null {
  const found = (Object.keys(ACCOUNTS) as AccountKey[]).find(
    (key) => ACCOUNTS[key].name.toLowerCase() === name.trim().toLowerCase(),
  );
  return found ?? null;
}

/** Compte attendu pour chaque type d'opération (celui d'où part l'argent) */
function defaultAccount(kind: OperationKind, channel: Channel | null): AccountKey | null {
  if (kind === 'retrait-banque') return 'banque';
  if (kind === 'depot-mvola') return 'cash';
  if (kind === 'retrait-mvola' || channel === 'transfert') return 'mvola';
  if (channel === 'achat-en-ligne' || channel === 'virement') return 'banque';
  if (channel === 'especes') return 'cash';
  return null;
}

export function parseCsv(text: string): ParsedCsv {
  const rows = splitCsv(text);
  const result: ParsedCsv = {
    operations: [],
    references: { banque: null, mvola: null },
    budgets: {},
    moto: [],
    fuelPrice: null,
    operationCount: 0,
    budgetLines: 0,
    readingCount: 0,
    months: null,
    errors: [],
  };
  if (rows.length === 0) {
    result.errors.push('Fichier vide');
    return result;
  }

  // Colonnes repérées par leur titre : l'ordre peut avoir changé dans Excel
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const index = Object.fromEntries(HEADER.map((name) => [name, col(name)])) as Record<string, number>;
  if (index['Type'] === -1 || index['Montant'] === -1) {
    result.errors.push("Ce fichier n'est pas un export Volako (colonnes Type et Montant introuvables)");
    return result;
  }

  const usedIds = new Set<number>();
  const months: string[] = [];

  /** Identifiant d'origine si possible (pour reconnaître les doublons), sinon un nouveau */
  const idOf = (text: string, line: number) => {
    let id = Number(text.replace(new RegExp('^' + ID_PREFIX, 'i'), ''));
    if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) id = Date.now() + line * 2;
    while (usedIds.has(id)) id++;
    usedIds.add(id);
    return id;
  };
  const positiveCell = (text: string) => {
    const n = parseAmountCell(text);
    return n !== null && n >= 0 ? n : null;
  };

  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const get = (name: string) => (index[name] >= 0 ? (row[index[name]] ?? '').trim() : '');
    const type = get('Type');
    const amount = parseAmountCell(get('Montant'));

    if (type === REFERENCE_TYPE) {
      const key = accountOf(get('Compte'));
      const date = parseDateCell(get('Date'));
      if ((key !== 'banque' && key !== 'mvola') || !date || amount === null) {
        result.errors.push(`Ligne ${line} : solde de référence incomplet`);
        return;
      }
      result.references[key] = { date, amount };
      return;
    }

    if (type === FUEL_PRICE_TYPE) {
      if (amount === null || amount <= 0) {
        result.errors.push(`Ligne ${line} : prix du litre invalide`);
        return;
      }
      result.fuelPrice = { price: amount, updatedAt: 0 };
      return;
    }

    if (type === READING_TYPE) {
      const date = parseDateCell(get('Date'));
      const km = positiveCell(get('Kilométrage'));
      const added = positiveCell(get('Essence ajoutée (L)')) || null;
      if (!date || (km === null && added === null)) {
        result.errors.push(`Ligne ${line} : relevé moto incomplet`);
        return;
      }
      result.moto.push({ id: idOf(get('ID'), line), date, km, fuelLeft: positiveCell(get('Essence restante (L)')), added });
      result.readingCount++;
      months.push(date.slice(0, 7));
      return;
    }

    if (type === BUDGET_TYPE) {
      const month = parseMonthCell(get('Date'));
      const category = get('Catégorie');
      if (!month || !isCategoryName(category) || amount === null || amount < 0) {
        result.errors.push(`Ligne ${line} : budget incomplet`);
        return;
      }
      const budget = (result.budgets[month] ??= { amounts: {}, edits: 0 });
      budget.amounts[category] = amount;
      const edits = /(\d+)\s*modification/.exec(get('Libellé'));
      if (edits) budget.edits = Math.max(budget.edits, Number(edits[1]));
      result.budgetLines++;
      months.push(month);
      return;
    }

    const opType = OPERATION_TYPES.find((t) => t.label.toLowerCase() === type.toLowerCase());
    const date = parseDateCell(get('Date'));
    if (!opType) {
      result.errors.push(`Ligne ${line} : type « ${type} » inconnu`);
      return;
    }
    if (!date || amount === null || amount <= 0) {
      result.errors.push(`Ligne ${line} : date ou montant invalide`);
      return;
    }
    const category = opType.kind === 'depense' ? get('Catégorie') : '';
    if (opType.kind === 'depense' && !isCategoryName(category)) {
      result.errors.push(`Ligne ${line} : catégorie « ${category} » inconnue`);
      return;
    }
    const account = accountOf(get('Compte')) ?? defaultAccount(opType.kind, opType.channel);
    if (!account) {
      result.errors.push(`Ligne ${line} : compte inconnu`);
      return;
    }

    const id = idOf(get('ID'), line);

    const op: Operation = {
      id,
      date,
      kind: opType.kind,
      account,
      amount,
      description: get('Libellé') || type,
      category: opType.kind === 'depense' ? category : null,
      channel: opType.channel,
      parentId: null,
    };
    const photo = get('Photo');
    if (photo.startsWith('https://')) op.photo = photo;
    if (op.category === FUEL_CATEGORY) {
      const odometer = positiveCell(get('Kilométrage'));
      const fuelLeft = positiveCell(get('Essence restante (L)'));
      const fuelPrice = positiveCell(get('Prix du litre'));
      if (odometer !== null) op.odometer = odometer;
      if (fuelLeft !== null) op.fuelLeft = fuelLeft;
      if (fuelPrice) op.fuelPrice = fuelPrice;
    }
    result.operations.push(op);
    result.operationCount++;
    months.push(date.slice(0, 7));

    // Les frais redeviennent une dépense Crédit Telma liée à leur opération
    const fees = parseAmountCell(get('Frais'));
    if (fees && fees > 0) {
      let feeId = id + 1;
      while (usedIds.has(feeId)) feeId++;
      usedIds.add(feeId);
      result.operations.push({
        id: feeId,
        date,
        kind: 'depense',
        account,
        amount: fees,
        description: 'Frais MVola',
        category: FEES_CATEGORY,
        channel: 'frais',
        parentId: id,
      });
    }
  });

  months.sort();
  result.months = months.length ? [months[0], months[months.length - 1]] : null;
  return result;
}
