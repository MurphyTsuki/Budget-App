import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BudgetStore } from '../../budget-store';
import { CATEGORIES, Operation } from '../../models';
import { PhotoService } from '../../photos';
import { UiService } from '../../ui.service';
import { DATE_ERROR, amountToInput, isoToFr, parseAmount, parseFrDate, parseNumber } from '../../utils';
import { AmountFieldComponent } from '../amount-field/amount-field';
import { DateFieldComponent } from '../date-field/date-field';
import { PhotoFieldComponent } from '../photo-field/photo-field';

const TITLES: Record<Operation['kind'], string> = {
  depense: 'Dépense',
  revenu: 'Revenu',
  'retrait-banque': 'Retrait bancaire',
  'depot-mvola': 'Dépôt MVola',
  'retrait-mvola': 'Retrait MVola',
};

/** Fenêtre de modification d'une opération (ouverte par un clic sur une ligne). */
@Component({
  selector: 'app-edit-op-modal',
  templateUrl: './edit-op-modal.html',
  imports: [FormsModule, AmountFieldComponent, DateFieldComponent, PhotoFieldComponent],
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class EditOpModalComponent {
  protected readonly ui = inject(UiService);
  private readonly store = inject(BudgetStore);
  protected readonly photos = inject(PhotoService);

  protected readonly categories = CATEGORIES;

  protected readonly op = computed(() => {
    const id = this.ui.editingId();
    return id === null ? null : (this.store.operations().find((op) => op.id === id) ?? null);
  });
  protected readonly title = computed(() => {
    const op = this.op();
    if (!op) return '';
    return op.channel === 'frais' ? 'Frais MVola' : TITLES[op.kind];
  });
  /** La catégorie se choisit pour les dépenses, sauf les frais (toujours dans Crédit Telma) */
  protected readonly hasCategory = computed(() => this.op()?.kind === 'depense' && this.op()?.channel !== 'frais');
  /** Les retraits et transferts MVola ont des frais */
  protected readonly hasFees = computed(() => {
    const op = this.op();
    return op?.kind === 'retrait-mvola' || op?.channel === 'transfert';
  });

  protected readonly description = signal('');
  protected readonly amount = signal('');
  protected readonly fees = signal('');
  protected readonly date = signal('');
  protected readonly category = signal('');
  protected readonly error = signal('');
  protected readonly photo = signal<Blob | null>(null);
  protected readonly photoName = signal('');

  constructor() {
    // À l'ouverture : remplit les champs avec l'opération choisie
    effect(() => {
      const id = this.ui.editingId();
      if (id === null) return;
      untracked(() => {
        const op = this.op();
        if (!op) {
          this.ui.closeEdit();
          return;
        }
        const fee = this.store.feeOf(op.id);
        this.description.set(op.description);
        this.amount.set(amountToInput(op.amount));
        this.fees.set(fee ? amountToInput(fee.amount) : '');
        this.date.set(isoToFr(op.date));
        this.category.set(op.category ?? '');
        this.error.set('');
        this.photo.set(null);
        this.photoName.set('');
      });
    });
  }

  protected onEscape(): void {
    if (this.ui.editingId() !== null) this.ui.closeEdit();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.ui.closeEdit();
  }

  protected save(): void {
    const op = this.op();
    if (!op) return;

    const description = this.description().trim();
    const amount = parseAmount(this.amount());
    const date = parseFrDate(this.date());
    const fees = this.fees().trim() === '' ? 0 : parseNumber(this.fees());

    if (!description) return this.error.set('Le libellé est obligatoire');
    if (amount === null) return this.error.set('Montant invalide');
    if (!date) return this.error.set(DATE_ERROR);
    if (fees === null) return this.error.set('Frais invalides');

    const changes = { description, amount, date, ...(this.hasCategory() ? { category: this.category() } : {}) };
    this.store.update(op.id, changes, this.hasFees() ? fees : undefined);
    const photo = this.photo();
    if (photo) void this.photos.attach(op.id, photo, this.photoName());
    this.ui.closeEdit();
    this.ui.notify('Opération modifiée');
  }

  protected remove(): void {
    const op = this.op();
    if (!op) return;
    const removed = this.store.remove(op.id);
    this.photos.trashPhotosOf(removed);
    this.ui.closeEdit();
    this.ui.notify('Opération supprimée', false, () => this.store.restore(removed));
  }
}
