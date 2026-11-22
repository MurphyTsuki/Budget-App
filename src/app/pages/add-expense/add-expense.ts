import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BudgetStore } from '../../budget-store';
import { AmountFieldComponent } from '../../components/amount-field/amount-field';
import { DateFieldComponent } from '../../components/date-field/date-field';
import { IconComponent } from '../../components/icon/icon';
import { CATEGORIES } from '../../models';
import { MoneyPipe } from '../../pipes';
import { UiService } from '../../ui.service';
import { DATE_ERROR, addDaysISO, formatMoney, parseAmount, parseFrDate, todayISO } from '../../utils';

type DateChoice = 'today' | 'yesterday' | 'other';

/** Bouton « + » : dépense en espèces, montant en grand, une des 12 catégories, date en raccourcis. */
@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.html',
  imports: [FormsModule, AmountFieldComponent, DateFieldComponent, IconComponent, MoneyPipe],
})
export class AddExpenseComponent {
  protected readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);

  protected readonly categories = CATEGORIES;

  protected readonly description = signal('');
  protected readonly amount = signal('');
  protected readonly category = signal('');
  protected readonly dateChoice = signal<DateChoice>('today');
  protected readonly otherDate = signal('');

  protected readonly submitLabel = computed(() => {
    const amount = parseAmount(this.amount());
    return amount === null ? 'Enregistrer' : `Enregistrer · ${formatMoney(amount)}`;
  });

  /** Nom court pour les tuiles (« Dép. maison ») */
  protected shortName(name: string): string {
    return name.replace(/^Dépenses? /, 'Dép. ');
  }

  protected submit(): void {
    const amount = parseAmount(this.amount());
    const category = this.category();
    const choice = this.dateChoice();
    const date =
      choice === 'today'
        ? todayISO()
        : choice === 'yesterday'
          ? addDaysISO(todayISO(), -1)
          : parseFrDate(this.otherDate().trim());

    if (amount === null) return this.ui.notify('Indique un montant.', true);
    if (!category) return this.ui.notify('Choisis une catégorie.', true);
    if (!date) return this.ui.notify(DATE_ERROR, true);

    // Sans libellé, la dépense prend le nom de sa catégorie
    const description = this.description().trim() || category;
    this.store.add({ kind: 'depense', account: 'cash', amount, description, date, category, channel: 'especes' });

    this.description.set('');
    this.amount.set('');
    this.category.set('');
    this.dateChoice.set('today');
    this.otherDate.set('');
    this.ui.notify('Dépense en espèces enregistrée');
  }
}
