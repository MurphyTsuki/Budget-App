import { Injectable, computed, effect, signal } from '@angular/core';

import {
  AccountKey,
  CATEGORIES,
  Category,
  Deletions,
  FEES_CATEGORY,
  MAX_BUDGET_EDITS,
  MOVES,
  MonthBudget,
  Operation,
  Reference,
  ReferenceKey,
  ReferenceTimes,
} from './models';
import type { VolakoData } from './csv';
import {
  clearOldData,
  loadBudgets,
  loadDeletions,
  loadOperations,
  loadReferenceTimes,
  loadReferences,
  saveBudgets,
  saveDeletions,
  saveOperations,
  saveReferenceTimes,
  saveReferences,
} from './storage';
import { generateId, monthOf, round2, todayISO } from './utils';

/** Une ligne du budget : ce qui était prévu pour la catégorie et ce qui a été dépensé. */
export interface BudgetLine {
  category: Category;
  budget: number;
  spent: number;
  /** Part consommée en % (arrondie), null si rien n'était prévu ni dépensé */
  percent: number | null;
}

export interface BudgetView {
  month: string;
  budget: MonthBudget | null;
  total: number;
  spent: number;
  percent: number;
  editsLeft: number;
  lines: BudgetLine[];
}

export type NewOperation = Omit<Operation, 'id' | 'parentId'>;

/** Tout ce qui se synchronise entre appareils */
export interface SyncState {
  operations: Operation[];
  deleted: Deletions;
  budgets: Record<string, MonthBudget>;
  references: Record<ReferenceKey, Reference | null>;
  referenceTimes: ReferenceTimes;
}

/** Part consommée en %, arrondie (null si 0 prévu et 0 dépensé). */
export function percentOf(spent: number, budget: number): number | null {
  if (budget > 0) return Math.round((spent / budget) * 100);
  return spent > 0 ? 100 : null;
}

/**
 * État de toute l'application : opérations des trois comptes, soldes de référence et budgets mensuels.
 * Les données sont sauvegardées automatiquement dans le localStorage à chaque changement.
 */
@Injectable({ providedIn: 'root' })
export class BudgetStore {
  readonly operations = signal<Operation[]>(this.load(loadOperations));
  readonly references = signal<Record<ReferenceKey, Reference | null>>(loadReferences());
  readonly budgets = signal<Record<string, MonthBudget>>(loadBudgets());
  /** Opérations supprimées et date des soldes de référence : utiles à la synchro entre appareils */
  readonly deleted = signal<Deletions>(loadDeletions());
  readonly referenceTimes = signal<ReferenceTimes>(loadReferenceTimes());

  /** État complet à synchroniser */
  readonly syncState = computed<SyncState>(() => ({
    operations: this.operations(),
    deleted: this.deleted(),
    budgets: this.budgets(),
    references: this.references(),
    referenceTimes: this.referenceTimes(),
  }));

  /** Solde de chaque compte */
  readonly balances = computed<Record<AccountKey, number>>(() => ({
    banque: this.computeBalance('banque'),
    cash: this.computeBalance('cash'),
    mvola: this.computeBalance('mvola'),
  }));

  readonly totalBalance = computed(() => {
    const b = this.balances();
    return round2(b.banque + b.cash + b.mvola);
  });

  constructor() {
    effect(() => saveOperations(this.operations()));
    effect(() => saveReferences(this.references()));
    effect(() => saveBudgets(this.budgets()));
    effect(() => saveDeletions(this.deleted()));
    effect(() => saveReferenceTimes(this.referenceTimes()));
  }

  /** Remplace tout par l'état fusionné venu de la synchro (les dates de modification sont gardées telles quelles). */
  applySynced(state: SyncState): void {
    this.operations.set(state.operations);
    this.deleted.set(state.deleted);
    this.budgets.set(state.budgets);
    this.references.set(state.references);
    this.referenceTimes.set(state.referenceTimes);
  }

  /** Note la suppression de ces opérations (pour qu'elles ne reviennent pas d'un autre appareil) */
  private markDeleted(ids: number[]): void {
    if (!ids.length) return;
    const now = Date.now();
    this.deleted.update((all) => ({ ...all, ...Object.fromEntries(ids.map((id) => [id, now])) }));
  }

  /** L'ancienne version rangeait les dépenses dans des catégories libres : ses données sont effacées. */
  private load<T>(loader: () => T): T {
    clearOldData();
    return loader();
  }

  /** Effet d'une opération sur le solde d'un compte (+ entrée, − sortie, 0 sans rapport). */
  delta(op: Operation, key: AccountKey): number {
    if (op.kind === 'depense') return op.account === key ? -op.amount : 0;
    if (op.kind === 'revenu') return op.account === key ? op.amount : 0;
    const [from, to] = MOVES[op.kind];
    if (from === key) return -op.amount;
    return to === key ? op.amount : 0;
  }

  /** Avec un solde de référence, seules les opérations à partir de sa date comptent. */
  private counts(op: Operation, key: AccountKey): boolean {
    const ref = key === 'cash' ? null : this.references()[key];
    return !ref || op.date >= ref.date;
  }

  private computeBalance(key: AccountKey): number {
    const ref = key === 'cash' ? null : this.references()[key];
    let balance = ref?.amount ?? 0;
    for (const op of this.operations()) {
      if (this.counts(op, key)) balance += this.delta(op, key);
    }
    return round2(balance);
  }

  /** Les opérations qui touchent ce compte, les plus récentes d'abord (les frais juste sous leur opération). */
  operationsOf(key: AccountKey | null, month?: string): Operation[] {
    const group = (op: Operation) => op.parentId ?? op.id;
    return this.operations()
      .filter((op) => (key === null || this.delta(op, key) !== 0) && (!month || monthOf(op.date) === month))
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || group(b) - group(a) || Number(a.parentId !== null) - Number(b.parentId !== null),
      );
  }

  /** Total des frais MVola du mois */
  feesOfMonth(month: string): number {
    return round2(
      this.operations()
        .filter((op) => op.channel === 'frais' && monthOf(op.date) === month)
        .reduce((total, op) => total + op.amount, 0),
    );
  }

  feeOf(parentId: number): Operation | undefined {
    return this.operations().find((op) => op.parentId === parentId);
  }

  /* ---------- Budget ---------- */

  budgetView(month: string): BudgetView {
    const budget = this.budgets()[month] ?? null;
    const spentBy = new Map<string, number>();
    for (const op of this.operations()) {
      if (op.kind === 'depense' && op.category && monthOf(op.date) === month) {
        spentBy.set(op.category, (spentBy.get(op.category) ?? 0) + op.amount);
      }
    }

    const lines = CATEGORIES.map((category) => {
      const planned = budget?.amounts[category.name] ?? 0;
      const spent = round2(spentBy.get(category.name) ?? 0);
      return { category, budget: planned, spent, percent: percentOf(spent, planned) };
    });
    const total = round2(lines.reduce((sum, line) => sum + line.budget, 0));
    const spent = round2(lines.reduce((sum, line) => sum + line.spent, 0));

    return {
      month,
      budget,
      total,
      spent,
      percent: percentOf(spent, total) ?? 0,
      editsLeft: budget ? Math.max(0, MAX_BUDGET_EDITS - budget.edits) : MAX_BUDGET_EDITS,
      lines,
    };
  }

  readonly currentBudget = computed(() => this.budgetView(monthOf(todayISO())));

  /**
   * Enregistre le budget du mois. La première validation est gratuite, ensuite chaque modification compte.
   * Renvoie false s'il ne reste plus de modification.
   */
  saveBudget(month: string, amounts: Record<string, number>): boolean {
    const existing = this.budgets()[month];
    if (existing && existing.edits >= MAX_BUDGET_EDITS) return false;
    const edits = existing ? existing.edits + 1 : 0;
    this.budgets.update((all) => ({ ...all, [month]: { amounts, edits, updatedAt: Date.now() } }));
    return true;
  }

  /* ---------- Opérations ---------- */

  /** Ajoute une opération, et ses frais MVola s'il y en a (rangés dans Crédit Telma). Renvoie son identifiant. */
  add(data: NewOperation, fees = 0): number {
    const id = generateId(this.operations());
    this.operations.update((list) => {
      const op: Operation = { ...data, id, parentId: null, updatedAt: Date.now() };
      const next = [...list, op];
      if (fees > 0) next.push(this.feeOperation(op, fees, generateId(next)));
      return next;
    });
    return id;
  }

  private feeOperation(parent: Operation, amount: number, id: number): Operation {
    return {
      id,
      date: parent.date,
      kind: 'depense',
      account: parent.account,
      amount,
      description: 'Frais MVola',
      category: FEES_CATEGORY,
      channel: 'frais',
      parentId: parent.id,
      updatedAt: Date.now(),
    };
  }

  /** Modifie une opération ; ses frais suivent sa date et prennent le montant `fees` (0 = supprimés). */
  update(id: number, changes: Partial<NewOperation>, fees?: number): void {
    const now = Date.now();
    const fee = fees === undefined ? undefined : this.operations().find((op) => op.parentId === id);
    if (fee && fees === 0) this.markDeleted([fee.id]);
    this.operations.update((list) => {
      let next = list.map((op) => (op.id === id ? { ...op, ...changes, updatedAt: now } : op));
      if (fees === undefined) return next;

      const parent = next.find((op) => op.id === id);
      if (!parent) return next;
      if (fee && fees > 0) {
        next = next.map((op) => (op.id === fee.id ? { ...op, amount: fees, date: parent.date, updatedAt: now } : op));
      } else if (fee) {
        next = next.filter((op) => op.id !== fee.id);
      } else if (fees > 0) {
        next = [...next, this.feeOperation(parent, fees, generateId(next))];
      }
      return next;
    });
  }

  /** Supprime l'opération (et ses frais) et renvoie ce qui a été retiré, pour pouvoir annuler. */
  remove(id: number): Operation[] {
    const removed = this.operations().filter((op) => op.id === id || op.parentId === id);
    this.operations.update((list) => list.filter((op) => op.id !== id && op.parentId !== id));
    this.markDeleted(removed.map((op) => op.id));
    return removed;
  }

  /** « Annuler » : l'opération revient, plus récente que sa suppression */
  restore(removed: Operation[]): void {
    const now = Date.now();
    const ids = new Set(removed.map((op) => op.id));
    this.deleted.update((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !ids.has(Number(id)))));
    this.operations.update((list) => [
      ...list,
      ...removed.filter((op) => !list.some((o) => o.id === op.id)).map((op) => ({ ...op, updatedAt: now })),
    ]);
  }

  setReference(key: ReferenceKey, ref: Reference | null): void {
    this.references.update((all) => ({ ...all, [key]: ref }));
    this.referenceTimes.update((times) => ({ ...times, [key]: Date.now() }));
  }

  /* ---------- Import d'un fichier CSV ---------- */

  /** Efface tout et reprend les données du fichier. */
  replaceAll(data: VolakoData): void {
    const now = Date.now();
    const kept = new Set(data.operations.map((op) => op.id));
    // Ce qui disparaît est supprimé aussi sur les autres appareils
    this.markDeleted(this.operations().filter((op) => !kept.has(op.id)).map((op) => op.id));
    this.operations.set(data.operations.map((op) => ({ ...op, updatedAt: now })));
    this.references.set(data.references);
    this.referenceTimes.set({ banque: now, mvola: now });
    this.budgets.set(Object.fromEntries(Object.entries(data.budgets).map(([m, b]) => [m, { ...b, updatedAt: now }])));
  }

  /**
   * Ajoute seulement ce qui manque : les opérations inconnues (reconnues par leur identifiant),
   * les budgets des mois qui n'en ont pas et les soldes de référence absents.
   * Renvoie le nombre d'opérations ajoutées.
   */
  addMissing(data: VolakoData): number {
    const known = new Set(this.operations().map((op) => op.id));
    const added = data.operations.filter((op) => op.parentId === null && !known.has(op.id));
    const addedIds = new Set(added.map((op) => op.id));
    // Les frais suivent leur opération : ajoutés seulement avec elle
    const fees = data.operations.filter((op) => op.parentId !== null && addedIds.has(op.parentId) && !known.has(op.id));

    const now = Date.now();
    this.operations.update((list) => [...list, ...[...added, ...fees].map((op) => ({ ...op, updatedAt: now }))]);
    const newMonths = Object.entries(data.budgets).filter(([month]) => !this.budgets()[month]);
    this.budgets.update((all) => ({ ...Object.fromEntries(newMonths.map(([m, b]) => [m, { ...b, updatedAt: now }])), ...all }));
    for (const key of ['banque', 'mvola'] as const) {
      const ref = data.references[key];
      if (!this.references()[key] && ref) this.setReference(key, ref);
    }
    return added.length;
  }
}
