import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { OpRowComponent } from '../../components/op-row/op-row';
import { DEFAULT_SORT, Sort, SortChipsComponent, sortOperations } from '../../components/sort-chips/sort-chips';
import { MoneyPipe } from '../../pipes';
import { monthLabel, round2 } from '../../utils';
import { routeMonth } from '../budget/budget';

/** Circonférence de l'anneau (rayon 50) */
const RING = 2 * Math.PI * 50;

/**
 * Détail d'une ligne du budget : prévu, dépensé, reste, et chaque dépense.
 * Adresse : #/budget/2026-11/categorie/Essence
 */
@Component({
  selector: 'app-budget-category',
  templateUrl: './budget-category.html',
  imports: [RouterLink, IconComponent, OpRowComponent, SortChipsComponent, MoneyPipe],
})
export class BudgetCategoryComponent {
  readonly month = input<string>();
  readonly category = input<string>();

  private readonly store = inject(BudgetStore);

  protected readonly current = computed(() => routeMonth(this.month()));
  protected readonly monthTitle = computed(() => monthLabel(this.current()).toLowerCase());

  protected readonly line = computed(
    () => this.store.budgetView(this.current()).lines.find((l) => l.category.name === this.category()) ?? null,
  );

  protected readonly remaining = computed(() => {
    const line = this.line();
    return line ? round2(line.budget - line.spent) : 0;
  });

  protected readonly ring = computed(() => {
    const percent = Math.min(this.line()?.percent ?? 0, 100);
    return `${((percent / 100) * RING).toFixed(1)} ${RING.toFixed(1)}`;
  });

  protected readonly sort = signal<Sort>(DEFAULT_SORT);

  protected readonly operations = computed(() =>
    sortOperations(
      this.store.operationsOf(null, this.current()).filter((op) => op.category === this.category()),
      this.sort(),
    ),
  );
}
