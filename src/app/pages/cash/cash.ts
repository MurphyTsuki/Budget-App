import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { OpSheetComponent, SheetKind } from '../../components/op-sheet/op-sheet';
import { MoneyPipe } from '../../pipes';

/**
 * Espèces : seulement l'argent liquide que j'ai sur moi.
 * Elles se remplissent toutes seules avec les retraits (banque et MVola). Adresse : #/comptes/especes
 */
@Component({
  selector: 'app-cash',
  templateUrl: './cash.html',
  imports: [RouterLink, IconComponent, OpSheetComponent, MoneyPipe],
})
export class CashComponent {
  protected readonly store = inject(BudgetStore);
  protected readonly sheet = signal<SheetKind | null>(null);
}
