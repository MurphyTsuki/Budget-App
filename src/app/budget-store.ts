import { Injectable, computed, effect, signal } from '@angular/core';

import {
  AccountKey,
  CATEGORIES,
  Category,
  FEES_CATEGORY,
  MAX_BUDGET_EDITS,
  MOVES,
  MonthBudget,
  Operation,
  Reference,
  ReferenceKey,
} from './models';
import {
  clearOldData,
  loadBudgets,
  loadOperations,
  loadReferences,
  saveBudgets,
  saveOperations,
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
    this.budgets.update((all) => ({ ...all, [month]: { amounts, edits } }));
    return true;
  }

  /* ---------- Opérations ---------- */

  /** Ajoute une opération, et ses frais MVola s'il y en a (rangés dans Crédit Telma). */
  add(data: NewOperation, fees = 0): void {
    this.operations.update((list) => {
      const op: Operation = { ...data, id: generateId(list), parentId: null };
      const next = [...list, op];
      if (fees > 0) next.push(this.feeOperation(op, fees, generateId(next)));
      return next;
    });
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
    };
  }

  /** Modifie une opération ; ses frais suivent sa date et prennent le montant `fees` (0 = supprimés). */
  update(id: number, changes: Partial<NewOperation>, fees?: number): void {
    this.operations.update((list) => {
      let next = list.map((op) => (op.id === id ? { ...op, ...changes } : op));
      if (fees === undefined) return next;

      const parent = next.find((op) => op.id === id);
      const fee = next.find((op) => op.parentId === id);
      if (!parent) return next;
      if (fee && fees > 0) {
        next = next.map((op) => (op === fee ? { ...op, amount: fees, date: parent.date } : op));
      } else if (fee) {
        next = next.filter((op) => op !== fee);
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
    return removed;
  }

  restore(removed: Operation[]): void {
    this.operations.update((list) => [...list, ...removed.filter((op) => !list.some((o) => o.id === op.id))]);
  }

  setReference(key: ReferenceKey, ref: Reference | null): void {
    this.references.update((all) => ({ ...all, [key]: ref }));
  }
}
