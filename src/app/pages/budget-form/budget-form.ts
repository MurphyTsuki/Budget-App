import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { AmountFieldComponent } from '../../components/amount-field/amount-field';
import { CategorySheetComponent } from '../../components/category-sheet/category-sheet';
import { IconComponent } from '../../components/icon/icon';
import { MoneyPipe } from '../../pipes';
import { UiService } from '../../ui.service';
import { amountToInput, monthLabel, parseNumber, round2, shiftMonth } from '../../utils';
import { routeMonth } from '../budget/budget';

/**
 * Définir (ou modifier) le budget d'un mois : un montant par catégorie.
 * La validation demande une confirmation, car il ne reste que 3 modifications ensuite.
 * Adresse : #/budget/2026-12/definir
 */
@Component({
  selector: 'app-budget-form',
  templateUrl: './budget-form.html',
  imports: [RouterLink, AmountFieldComponent, CategorySheetComponent, IconComponent, MoneyPipe],
})
export class BudgetFormComponent {
  readonly month = input<string>();

  private readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);
  private readonly router = inject(Router);

  /** Lignes retirées dans ce formulaire : elles ne disparaissent qu'à la confirmation */
  protected readonly removed = signal<readonly string[]>([]);
  protected readonly categories = computed(() => this.store.categories().filter((c) => !this.removed().includes(c.name)));
  /** Fenêtre « Nouvelle catégorie » */
  protected readonly creating = signal(false);
  protected readonly current = computed(() => routeMonth(this.month()));
  protected readonly title = computed(() => monthLabel(this.current()));

  /** Budget du mois précédent, proposé à la copie quand le budget du mois n'existe pas encore */
  protected readonly previous = computed(() => {
    const month = shiftMonth(this.current(), -1);
    const budget = this.store.budgets()[month];
    return budget ? { label: monthLabel(month).toLowerCase(), amounts: budget.amounts } : null;
  });
  protected readonly view = computed(() => this.store.budgetView(this.current()));

  /** Montant saisi pour chaque catégorie */
  protected readonly values = signal<Record<string, string>>({});
  /** Premier clic sur « Valider » : on demande confirmation */
  protected readonly confirming = signal(false);
  protected readonly error = signal('');

  protected readonly total = computed(() =>
    round2(this.categories().reduce((sum, c) => sum + (parseNumber(this.values()[c.name] ?? '') ?? 0), 0)),
  );

  constructor() {
    // Reprend le budget déjà défini pour le modifier
    effect(() => {
      const budget = this.store.budgets()[this.current()];
      untracked(() => {
        const values: Record<string, string> = {};
        for (const c of this.store.categories()) {
          const amount = budget?.amounts[c.name];
          values[c.name] = amount ? amountToInput(amount) : '';
        }
        this.values.set(values);
        this.removed.set([]);
        this.confirming.set(false);
      });
    });
  }

  /** Retire la ligne du budget (annulable jusqu'à la confirmation) */
  protected removeLine(name: string): void {
    this.removed.update((list) => [...list, name]);
    this.confirming.set(false);
    this.error.set('');
  }

  protected restoreLine(name: string): void {
    this.removed.update((list) => list.filter((n) => n !== name));
    this.confirming.set(false);
  }

  /** Remplit les montants avec ceux du mois précédent ; rien n'est enregistré avant la confirmation */
  protected copyPrevious(): void {
    const previous = this.previous();
    if (!previous) return;
    const values: Record<string, string> = {};
    for (const c of this.categories()) {
      const amount = previous.amounts[c.name];
      values[c.name] = amount ? amountToInput(amount) : '';
    }
    this.values.set(values);
    this.confirming.set(false);
    this.error.set('');
    this.ui.notify(`Montants de ${previous.label} copiés : vérifie-les puis valide`);
  }

  protected setValue(category: string, text: string): void {
    this.values.update((all) => ({ ...all, [category]: text }));
    this.confirming.set(false);
    this.error.set('');
  }

  protected submit(): void {
    const amounts: Record<string, number> = {};
    for (const c of this.categories()) {
      const text = this.values()[c.name]?.trim() ?? '';
      const amount = text === '' ? 0 : parseNumber(text);
      if (amount === null) return this.error.set(`Montant invalide pour ${c.name}`);
      amounts[c.name] = amount;
    }
    if (this.total() <= 0) return this.error.set('Indique au moins un montant');

    if (!this.confirming()) {
      this.confirming.set(true);
      return;
    }

    const isEdit = this.view().budget !== null;
    if (!this.store.saveBudget(this.current(), amounts)) {
      return this.error.set('Plus aucune modification possible pour ce mois');
    }
    this.store.setRemoved(this.removed(), true);
    this.ui.notify(isEdit ? 'Budget modifié' : 'Budget validé');
    void this.router.navigate(['/budget', this.current()]);
  }
}
