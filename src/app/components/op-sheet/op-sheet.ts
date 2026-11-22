import { Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BudgetStore, NewOperation } from '../../budget-store';
import { CATEGORIES, TRANSFER_CATEGORY } from '../../models';
import { UiService } from '../../ui.service';
import { DATE_ERROR, formatMoney, parseAmount, parseFrDate, parseNumber, todayISO } from '../../utils';
import { AmountFieldComponent } from '../amount-field/amount-field';
import { DateFieldComponent } from '../date-field/date-field';

/** Les formulaires d'ajout des pages Banque, Espèces et MVola. */
export type SheetKind =
  | 'revenu-banque'
  | 'achat-en-ligne'
  | 'retrait-banque'
  | 'virement'
  | 'especes'
  | 'depot-mvola'
  | 'retrait-mvola'
  | 'transfert-mvola';

interface SheetConfig {
  label: string;
  title: string;
  hint?: string;
  /** Libellé : obligatoire, facultatif (valeur par défaut) ou absent */
  description: { required: true; placeholder: string } | { required: false; fallback: string } | null;
  category?: boolean;
  fees?: boolean;
  done: string;
  build: (amount: number, description: string, date: string, category: string) => NewOperation;
}

const expense = (account: 'banque' | 'mvola' | 'cash', channel: NewOperation['channel']) =>
  (amount: number, description: string, date: string, category: string): NewOperation => ({
    kind: 'depense', account, amount, description, date, category, channel,
  });

const SHEETS: Record<SheetKind, SheetConfig> = {
  'revenu-banque': {
    label: 'Banque',
    title: 'Nouveau revenu',
    description: { required: true, placeholder: 'Ex: Salaire' },
    done: 'Revenu enregistré',
    build: (amount, description, date) => ({ kind: 'revenu', account: 'banque', amount, description, date, category: null, channel: null }),
  },
  'achat-en-ligne': {
    label: 'Banque · dépense',
    title: 'Achat en ligne',
    description: { required: true, placeholder: 'Ex: Abonnement fibre' },
    category: true,
    done: 'Achat enregistré',
    build: expense('banque', 'achat-en-ligne'),
  },
  'retrait-banque': {
    label: 'Banque · dépense',
    title: 'Retrait bancaire',
    hint: 'Le montant sera ajouté automatiquement à tes espèces. Il ne compte pas dans le budget.',
    description: { required: false, fallback: 'Retrait bancaire' },
    done: 'Retrait enregistré, espèces mises à jour',
    build: (amount, description, date) => ({ kind: 'retrait-banque', account: 'banque', amount, description, date, category: null, channel: null }),
  },
  virement: {
    label: 'Banque · dépense',
    title: 'Virement bancaire',
    hint: 'Compté automatiquement dans la catégorie Imprévu.',
    description: { required: true, placeholder: 'Ex: Virement à Hery' },
    done: 'Virement enregistré dans Imprévu',
    build: (amount, description, date) => expense('banque', 'virement')(amount, description, date, TRANSFER_CATEGORY),
  },
  especes: {
    label: 'Espèces',
    title: 'Ajouter des espèces',
    hint: 'Argent liquide reçu en plus (vente, cadeau, monnaie...).',
    description: { required: true, placeholder: 'Ex: Cadeau' },
    done: 'Espèces ajoutées',
    build: (amount, description, date) => ({ kind: 'revenu', account: 'cash', amount, description, date, category: null, channel: null }),
  },
  'depot-mvola': {
    label: 'MVola',
    title: 'Dépôt MVola',
    hint: 'Le montant est pris sur tes espèces.',
    description: null,
    done: 'Dépôt enregistré',
    build: (amount, _description, date) => ({ kind: 'depot-mvola', account: 'cash', amount, description: 'Dépôt MVola', date, category: null, channel: null }),
  },
  'retrait-mvola': {
    label: 'MVola',
    title: 'Retrait MVola',
    hint: 'Le montant est ajouté à tes espèces. Les frais vont dans Crédit Telma.',
    description: { required: false, fallback: 'Retrait MVola' },
    fees: true,
    done: 'Retrait enregistré, espèces mises à jour',
    build: (amount, description, date) => ({ kind: 'retrait-mvola', account: 'mvola', amount, description, date, category: null, channel: null }),
  },
  'transfert-mvola': {
    label: "Transfert d'argent",
    title: 'Envoyer',
    hint: 'Les frais vont automatiquement dans Crédit Telma.',
    description: { required: true, placeholder: 'Ex: Loyer' },
    category: true,
    fees: true,
    done: 'Transfert enregistré',
    build: expense('mvola', 'transfert'),
  },
};

/**
 * Fenêtre d'ajout d'une opération. S'ouvre quand `kind` reçoit un type de formulaire.
 *
 * Utilisation : <app-op-sheet [(kind)]="sheet" />
 */
@Component({
  selector: 'app-op-sheet',
  templateUrl: './op-sheet.html',
  imports: [FormsModule, AmountFieldComponent, DateFieldComponent],
  host: { '(document:keydown.escape)': 'close()' },
})
export class OpSheetComponent {
  readonly kind = model<SheetKind | null>(null);

  private readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);

  protected readonly categories = CATEGORIES;
  protected readonly config = computed(() => {
    const kind = this.kind();
    return kind ? SHEETS[kind] : null;
  });

  protected readonly amount = signal('');
  protected readonly description = signal('');
  protected readonly category = signal('');
  protected readonly fees = signal('');
  protected readonly date = signal('');
  protected readonly error = signal('');

  /** Total débité (montant + frais) */
  protected readonly total = computed(() => {
    const amount = parseAmount(this.amount()) ?? 0;
    const fees = parseNumber(this.fees()) ?? 0;
    return fees > 0 ? formatMoney(amount + fees) : null;
  });

  constructor() {
    // Champs vides à chaque ouverture
    effect(() => {
      if (!this.kind()) return;
      untracked(() => {
        for (const field of [this.amount, this.description, this.category, this.fees, this.date, this.error]) {
          field.set('');
        }
      });
    });
  }

  protected close(): void {
    this.kind.set(null);
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  protected submit(): void {
    const config = this.config();
    if (!config) return;

    const amount = parseAmount(this.amount());
    const fees = this.fees().trim() === '' ? 0 : parseNumber(this.fees());
    const rawDate = this.date().trim();
    const date = rawDate === '' ? todayISO() : parseFrDate(rawDate);
    let description = this.description().trim();
    if (!description && config.description && !config.description.required) {
      description = config.description.fallback;
    }

    if (amount === null) return this.error.set('Montant invalide');
    if (config.description?.required && !description) return this.error.set('Le libellé est obligatoire');
    if (config.category && !this.category()) return this.error.set('Choisis une catégorie');
    if (fees === null) return this.error.set('Frais invalides');
    if (!date) return this.error.set(DATE_ERROR);

    this.store.add(config.build(amount, description, date, this.category()), fees);
    this.ui.notify(config.done);
    this.close();
  }
}
