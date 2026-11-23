import { Component, computed, inject, input, model } from '@angular/core';

import { BudgetStore } from '../../budget-store';
import { Operation } from '../../models';
import { formatMoney, formatNumber, parseAmount, parseNumber } from '../../utils';
import { AmountFieldComponent } from '../amount-field/amount-field';

/** Kilométrage et essence restante lus dans les champs : les valeurs, ou un message d'erreur */
export function readFuelFields(km: string, left: string): Pick<Operation, 'odometer' | 'fuelLeft'> | string {
  const odometer = km.trim() === '' ? undefined : parseNumber(km);
  const fuelLeft = left.trim() === '' ? undefined : parseNumber(left);
  if (odometer === null) return 'Kilométrage invalide';
  if (fuelLeft === null) return 'Essence restante invalide';
  return { odometer, fuelLeft };
}

/**
 * Champs moto d'une dépense Essence : kilométrage au compteur et essence restante avant le plein.
 * Affiche aussi les litres calculés à partir du montant.
 *
 * Utilisation : <app-fuel-fields inputId="add" [amount]="amount()" [(km)]="km" [(left)]="left" />
 */
@Component({
  selector: 'app-fuel-fields',
  imports: [AmountFieldComponent],
  template: `
    <div class="fuel-fields">
      <p class="hint">
        @if (liters(); as l) {
          ≈ <b>{{ l }} L</b> à {{ priceLabel() }} le litre.
        }
        Pour le suivi moto, note le compteur et l'essence qu'il restait avant d'en remettre.
      </p>
      <div class="grid-2">
        <div class="field">
          <label class="label" [for]="inputId() + '-km'">Kilométrage</label>
          <app-amount-field [inputId]="inputId() + '-km'" placeholder="Ex: 12450" [(value)]="km" />
        </div>
        <div class="field">
          <label class="label" [for]="inputId() + '-left'">Restait (L)</label>
          <app-amount-field [inputId]="inputId() + '-left'" placeholder="Ex: 0,5" [(value)]="left" />
        </div>
      </div>
    </div>
  `,
})
export class FuelFieldsComponent {
  readonly inputId = input('fuel');
  /** Montant saisi (texte du champ) */
  readonly amount = input('');
  /** Prix du litre de la dépense modifiée (sinon le prix actuel) */
  readonly price = input<number | undefined>(undefined);
  readonly km = model('');
  readonly left = model('');

  private readonly store = inject(BudgetStore);

  private readonly litrePrice = computed(() => this.price() ?? this.store.fuelPrice().price);
  protected readonly priceLabel = computed(() => formatMoney(this.litrePrice()));
  protected readonly liters = computed(() => {
    const amount = parseAmount(this.amount());
    return amount === null ? null : formatNumber(amount / this.litrePrice());
  });
}
