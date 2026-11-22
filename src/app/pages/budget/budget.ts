import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { MAX_BUDGET_EDITS } from '../../models';
import { MoneyPipe } from '../../pipes';
import { FIRST_MONTH, monthLabel, monthOf, shiftMonth, todayISO } from '../../utils';

/** Mois de l'adresse ("AAAA-MM"), sinon le mois en cours (jamais avant le premier mois suivi). */
export function routeMonth(value: string | undefined): string {
  const month = value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : monthOf(todayISO());
  return month < FIRST_MONTH ? FIRST_MONTH : month;
}

/** Classe de couleur d'un pourcentage : jaune à partir de 85 %, rouge à 100 %. */
export function percentClass(percent: number | null): string {
  if (percent === null) return '';
  if (percent >= 100) return 'over';
  return percent >= 85 ? 'warn' : '';
}

/**
 * Budget d'un mois : alerte rouge s'il n'est pas défini, sinon la consommation des 12 catégories.
 * Adresses : #/budget (mois en cours) et #/budget/2026-12.
 */
@Component({
  selector: 'app-budget',
  templateUrl: './budget.html',
  imports: [RouterLink, IconComponent, MoneyPipe],
})
export class BudgetComponent {
  readonly month = input<string>();

  private readonly store = inject(BudgetStore);

  protected readonly current = computed(() => routeMonth(this.month()));
  protected readonly title = computed(() => monthLabel(this.current()));
  /** Mois précédent, null avant le premier mois suivi */
  protected readonly previous = computed(() => (this.current() > FIRST_MONTH ? shiftMonth(this.current(), -1) : null));
  protected readonly next = computed(() => shiftMonth(this.current(), 1));
  protected readonly view = computed(() => this.store.budgetView(this.current()));

  /** Une pastille par modification : allumée tant qu'elle est disponible */
  protected readonly edits = computed(() =>
    Array.from({ length: MAX_BUDGET_EDITS }, (_, i) => i < this.view().editsLeft),
  );

  protected readonly percentClass = percentClass;
}
