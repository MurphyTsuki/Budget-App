import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { OpSheetComponent, SheetKind } from '../../components/op-sheet/op-sheet';
import { ReferenceCardComponent } from '../../components/reference-card/reference-card';
import { MoneyPipe } from '../../pipes';
import { monthOf, round2, todayISO } from '../../utils';

/** Les trois façons de dépenser depuis la banque */
const EXPENSE_CHOICES: { kind: SheetKind; title: string; text: string; icon: string; color: string }[] = [
  { kind: 'achat-en-ligne', title: 'Achat en ligne', text: 'Tu choisis la catégorie parmi les 12', icon: 'cart', color: '#00c1f2' },
  { kind: 'retrait-banque', title: 'Retrait bancaire', text: 'Ajouté automatiquement aux espèces · hors budget', icon: 'out', color: '#e2432c' },
  { kind: 'virement', title: 'Virement bancaire', text: 'Compté automatiquement dans Imprévu', icon: 'send', color: '#ef7466' },
];

/** Compte bancaire (BRED) : solde, solde de référence, revenus et dépenses. Adresse : #/comptes/banque */
@Component({
  selector: 'app-bank',
  templateUrl: './bank.html',
  imports: [RouterLink, IconComponent, OpSheetComponent, ReferenceCardComponent, MoneyPipe],
})
export class BankComponent {
  protected readonly store = inject(BudgetStore);

  protected readonly choices = EXPENSE_CHOICES;
  /** Fenêtre « Quel type de dépense ? » */
  protected readonly choosing = signal(false);
  protected readonly sheet = signal<SheetKind | null>(null);

  /** Variation du solde depuis le début du mois */
  protected readonly monthChange = computed(() => {
    const month = monthOf(todayISO());
    return round2(
      this.store.operationsOf('banque', month).reduce((sum, op) => sum + this.store.delta(op, 'banque'), 0),
    );
  });

  protected choose(kind: SheetKind): void {
    this.choosing.set(false);
    this.sheet.set(kind);
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.choosing.set(false);
  }
}
