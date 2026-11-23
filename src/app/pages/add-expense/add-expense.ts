import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BudgetStore } from '../../budget-store';
import { AmountFieldComponent } from '../../components/amount-field/amount-field';
import { DateFieldComponent } from '../../components/date-field/date-field';
import { CategorySheetComponent } from '../../components/category-sheet/category-sheet';
import { IconComponent } from '../../components/icon/icon';
import { PhotoFieldComponent } from '../../components/photo-field/photo-field';
import { PhotoService } from '../../photos';
import { MoneyPipe } from '../../pipes';
import { UiService } from '../../ui.service';
import { DATE_ERROR, addDaysISO, formatMoney, parseAmount, parseFrDate, todayISO } from '../../utils';

type DateChoice = 'today' | 'yesterday' | 'other';

/** Bouton « + » : dépense en espèces, montant en grand, une catégorie en tuile, date en raccourcis. */
@Component({
  selector: 'app-add-expense',
  templateUrl: './add-expense.html',
  imports: [
    FormsModule,
    AmountFieldComponent,
    CategorySheetComponent,
    DateFieldComponent,
    IconComponent,
    PhotoFieldComponent,
    MoneyPipe,
  ],
})
export class AddExpenseComponent {
  protected readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);
  private readonly photos = inject(PhotoService);

  protected readonly categories = this.store.categories;

  protected readonly description = signal('');
  protected readonly amount = signal('');
  protected readonly category = signal('');
  protected readonly dateChoice = signal<DateChoice>('today');
  protected readonly otherDate = signal('');
  protected readonly photo = signal<Blob | null>(null);
  protected readonly photoName = signal('');
  /** Fenêtre « Nouvelle catégorie » */
  protected readonly creating = signal(false);

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

    if (amount === null) return this.ui.notify('Indique un montant', true);
    if (!category) return this.ui.notify('Choisis une catégorie', true);
    if (!date) return this.ui.notify(DATE_ERROR, true);

    // Sans libellé, la dépense prend le nom de sa catégorie
    const description = this.description().trim() || category;
    const id = this.store.add({ kind: 'depense', account: 'cash', amount, description, date, category, channel: 'especes' });
    const photo = this.photo();
    if (photo) void this.photos.attach(id, photo, this.photoName());

    this.description.set('');
    this.amount.set('');
    this.category.set('');
    this.dateChoice.set('today');
    this.otherDate.set('');
    this.photo.set(null);
    this.photoName.set('');
    this.ui.notify('Dépense en espèces enregistrée');
  }
}
