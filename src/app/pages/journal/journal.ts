import { Component, computed, inject, signal } from '@angular/core';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { OpRowComponent } from '../../components/op-row/op-row';
import { DEFAULT_SORT, Sort, SortChipsComponent, sortOperations } from '../../components/sort-chips/sort-chips';
import { AccountKey, Operation } from '../../models';
import { MoneyPipe } from '../../pipes';
import { FIRST_MONTH, dayLabel, monthLabel, monthOf, round2, shiftMonth, todayISO } from '../../utils';

type Filter = 'tout' | AccountKey;

/**
 * Journal des dépenses : toutes les opérations du mois, groupées par jour (ou triées par montant, A→Z).
 * Filtres par compte ; un clic sur une ligne ouvre la fenêtre de modification. Adresse : #/depenses
 */
@Component({
  selector: 'app-journal',
  templateUrl: './journal.html',
  imports: [IconComponent, OpRowComponent, SortChipsComponent, MoneyPipe],
})
export class JournalComponent {
  private readonly store = inject(BudgetStore);

  protected readonly filters: { id: Filter; label: string }[] = [
    { id: 'tout', label: 'Tout' },
    { id: 'cash', label: 'Espèces' },
    { id: 'banque', label: 'Banque' },
    { id: 'mvola', label: 'MVola' },
  ];

  private readonly thisMonth = monthOf(todayISO());
  protected readonly month = signal(this.thisMonth);
  protected readonly filter = signal<Filter>('tout');
  protected readonly sort = signal<Sort>(DEFAULT_SORT);

  protected readonly title = computed(() => monthLabel(this.month()));
  protected readonly isCurrentMonth = computed(() => this.month() >= this.thisMonth);
  protected readonly isFirstMonth = computed(() => this.month() <= FIRST_MONTH);

  private readonly operations = computed(() => {
    const filter = this.filter();
    return sortOperations(this.store.operationsOf(filter === 'tout' ? null : filter, this.month()), this.sort());
  });

  /** Liste sans regroupement, pour les tris par montant et alphabétique */
  protected readonly flat = computed(() => (this.sort().key === 'date' ? null : this.operations()));

  /** Total dépensé (budget) sur les opérations affichées */
  protected readonly spent = computed(() => spentOf(this.operations()));

  protected readonly days = computed(() => {
    const groups: { date: string; label: string; spent: number; ops: Operation[] }[] = [];
    for (const op of this.operations()) {
      let group = groups.at(-1);
      if (group?.date !== op.date) {
        group = { date: op.date, label: dayLabel(op.date), spent: 0, ops: [] };
        groups.push(group);
      }
      group.ops.push(op);
    }
    for (const group of groups) group.spent = spentOf(group.ops);
    return groups;
  });

  protected shift(n: number): void {
    this.month.update((month) => shiftMonth(month, n));
  }
}

function spentOf(ops: Operation[]): number {
  return round2(ops.reduce((sum, op) => (op.kind === 'depense' ? sum + op.amount : sum), 0));
}
