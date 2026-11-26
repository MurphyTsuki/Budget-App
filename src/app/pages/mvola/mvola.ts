import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { OpRowComponent } from '../../components/op-row/op-row';
import { OpSheetComponent, SheetKind } from '../../components/op-sheet/op-sheet';
import { ReferenceCardComponent } from '../../components/reference-card/reference-card';
import { MoneyPipe } from '../../pipes';
import { MONTHS, monthOf, todayISO } from '../../utils';

/** Nombre d'opérations affichées sous les boutons */
const RECENT = 5;

/**
 * MVola (mobile money) : alimenté uniquement depuis les espèces.
 * Dépôt (vert), retrait (rouge) et transfert (jaune) ; les frais vont dans Crédit Telma.
 * Adresse : #/comptes/mvola
 */
@Component({
  selector: 'app-mvola',
  templateUrl: './mvola.html',
  imports: [RouterLink, IconComponent, OpRowComponent, OpSheetComponent, ReferenceCardComponent, MoneyPipe],
})
export class MvolaComponent {
  protected readonly store = inject(BudgetStore);
  protected readonly sheet = signal<SheetKind | null>(null);

  /** Frais du mois en cours, et des mois suivants s'il y a déjà des opérations datées plus tard */
  protected readonly fees = computed(() => {
    const current = monthOf(todayISO());
    const months = new Set([current]);
    for (const op of this.store.operations()) {
      if (op.channel === 'frais' && monthOf(op.date) > current) months.add(monthOf(op.date));
    }
    return [...months].sort().map((month) => ({
      month,
      name: MONTHS[Number(month.slice(5)) - 1].toLowerCase(),
      amount: this.store.feesOfMonth(month),
    }));
  });

  /** Dernières opérations, sans les lignes de frais (elles sont affichées avec leur transfert) */
  protected readonly recent = computed(() =>
    this.store
      .operationsOf('mvola')
      .filter((op) => op.channel !== 'frais')
      .slice(0, RECENT),
  );
}
