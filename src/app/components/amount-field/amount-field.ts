import { Component, input, model } from '@angular/core';

import { cleanAmountText } from '../../utils';

/**
 * Champ de montant : chiffres et une virgule uniquement (2 décimales maximum).
 * Une virgule sans chiffre derrière est complétée par 0 ("1500," -> "1500,0").
 *
 * Utilisation : <app-amount-field inputId="amount" [(value)]="amount" />
 */
@Component({
  selector: 'app-amount-field',
  templateUrl: './amount-field.html',
})
export class AmountFieldComponent {
  /** Texte saisi (ex. "1500,5") */
  readonly value = model('');
  readonly inputId = input('');
  readonly placeholder = input('');
  /** Autorise un « - » au début (solde bancaire négatif) */
  readonly allowNegative = input(false);

  protected onInput(event: Event): void {
    const field = event.target as HTMLInputElement;
    const cleaned = cleanAmountText(field.value, this.allowNegative());
    if (cleaned !== field.value) field.value = cleaned;
    this.value.set(cleaned);
  }

  protected onBlur(): void {
    if (this.value().endsWith(',')) this.value.update((text) => text + '0');
  }
}
