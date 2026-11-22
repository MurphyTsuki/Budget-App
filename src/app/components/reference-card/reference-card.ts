import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BudgetStore } from '../../budget-store';
import { ReferenceKey } from '../../models';
import { FrDatePipe, MoneyPipe } from '../../pipes';
import { UiService } from '../../ui.service';
import { DATE_ERROR, amountToInput, isoToFr, parseFrDate, parseNumber, todayISO } from '../../utils';
import { AmountFieldComponent } from '../amount-field/amount-field';
import { DateFieldComponent } from '../date-field/date-field';
import { IconComponent } from '../icon/icon';

/**
 * Solde de référence d'un compte (relevé de la banque, solde affiché par MVola).
 * Les opérations antérieures à sa date ne comptent plus dans le solde.
 *
 * Utilisation : <app-reference-card account="banque" />
 */
@Component({
  selector: 'app-reference-card',
  templateUrl: './reference-card.html',
  imports: [FormsModule, AmountFieldComponent, DateFieldComponent, IconComponent, FrDatePipe, MoneyPipe],
})
export class ReferenceCardComponent {
  readonly account = input.required<ReferenceKey>();

  private readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);

  protected readonly reference = computed(() => this.store.references()[this.account()]);
  protected readonly editing = signal(false);
  protected readonly date = signal('');
  protected readonly amount = signal('');

  protected open(): void {
    const ref = this.reference();
    this.date.set(isoToFr(ref ? ref.date : todayISO()));
    this.amount.set(ref ? amountToInput(ref.amount) : '');
    this.editing.set(true);
  }

  protected save(): void {
    const date = parseFrDate(this.date());
    // Le solde peut être négatif (découvert)
    const amount = parseNumber(this.amount(), true);
    if (!date) return this.ui.notify(DATE_ERROR, true);
    if (amount === null) return this.ui.notify('Montant invalide.', true);

    this.store.setReference(this.account(), { date, amount });
    this.editing.set(false);
    this.ui.notify('Solde de référence enregistré');
  }

  protected clear(): void {
    const previous = this.reference();
    this.store.setReference(this.account(), null);
    this.editing.set(false);
    this.ui.notify('Solde de référence retiré', false, () => this.store.setReference(this.account(), previous));
  }
}
