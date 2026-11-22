import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { CrystalComponent } from '../../components/crystal/crystal';
import { IconComponent } from '../../components/icon/icon';
import { MONTHS, daysLeftInMonth, monthLabel, monthOf, shiftMonth, todayISO } from '../../utils';

/** Rappel affiché pendant les derniers jours du mois si le budget suivant n'est pas fait */
const REMINDER_DAYS = 5;

/** Accueil : le mois en cours et le grand cristal du budget. */
@Component({
  selector: 'app-home',
  templateUrl: './home.html',
  imports: [RouterLink, CrystalComponent, IconComponent],
})
export class HomeComponent {
  private readonly store = inject(BudgetStore);

  private readonly month = monthOf(todayISO());
  protected readonly monthTitle = monthLabel(this.month);

  /** Part du budget consommée (null = pas de budget ce mois-ci) */
  protected readonly percent = computed(() => {
    const view = this.store.currentBudget();
    return view.budget && view.total > 0 ? view.percent : null;
  });

  /** Mois suivant dont le budget reste à faire (seulement les derniers jours du mois) */
  protected readonly reminder = computed(() => {
    if (daysLeftInMonth(todayISO()) > REMINDER_DAYS) return null;
    const next = shiftMonth(this.month, 1);
    if (this.store.budgets()[next]) return null;
    return { month: next, name: MONTHS[Number(next.slice(5)) - 1].toLowerCase() };
  });
}
