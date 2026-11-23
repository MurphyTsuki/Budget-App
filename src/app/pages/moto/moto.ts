import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { AmountFieldComponent } from '../../components/amount-field/amount-field';
import { DateFieldComponent } from '../../components/date-field/date-field';
import { IconComponent } from '../../components/icon/icon';
import { findCategory, FUEL_CATEGORY, MotoReading } from '../../models';
import { MotoEvent, motoStats } from '../../moto';
import { MoneyPipe } from '../../pipes';
import { UiService } from '../../ui.service';
import {
  DATE_ERROR,
  addDaysISO,
  amountToInput,
  dayLabel,
  formatMoney,
  formatNumber,
  isoToFr,
  monthOf,
  parseAmount,
  parseFrDate,
  parseNumber,
  todayISO,
} from '../../utils';

type DateChoice = 'today' | 'yesterday' | 'other';
/** km/L ou L/100 km */
type Unit = 'kml' | 'l100';

const UNIT_KEY = 'motoUnit';

function loadUnit(): Unit {
  try {
    return localStorage.getItem(UNIT_KEY) === 'l100' ? 'l100' : 'kml';
  } catch {
    return 'kml';
  }
}

/**
 * Moto : consommation moyenne en haut, journal des relevés et des pleins, nouveau relevé en bas.
 * Les dépenses Essence y apparaissent toutes seules. Adresse : #/moto
 */
@Component({
  selector: 'app-moto',
  templateUrl: './moto.html',
  imports: [FormsModule, RouterLink, AmountFieldComponent, DateFieldComponent, IconComponent, MoneyPipe],
})
export class MotoComponent {
  protected readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);

  private readonly form = viewChild<ElementRef<HTMLElement>>('form');

  protected readonly unit = signal<Unit>(loadUnit());
  protected readonly fuelColor = findCategory(FUEL_CATEGORY).color;

  private readonly month = monthOf(todayISO());
  protected readonly stats = computed(() => motoStats(this.store.motoEvents(), this.month));
  /** Le plus récent en haut */
  protected readonly journal = computed(() => [...this.store.motoEvents()].reverse());

  /** Consommation moyenne dans l'unité choisie */
  protected readonly average = computed(() => this.consumption(this.stats().kmPerL));
  protected readonly costPerKm = computed(() => {
    const kmPerL = this.stats().kmPerL;
    return kmPerL ? formatMoney(Math.round(this.store.fuelPrice().price / kmPerL)) : null;
  });

  /* ---------- Prix du litre ---------- */
  protected readonly editingPrice = signal(false);
  protected readonly priceText = signal('');

  /* ---------- Formulaire du relevé ---------- */
  /** Relevé en cours de modification (null = nouveau relevé) */
  protected readonly editing = signal<MotoReading | null>(null);
  protected readonly dateChoice = signal<DateChoice>('today');
  protected readonly otherDate = signal('');
  protected readonly km = signal('');
  protected readonly left = signal('');
  protected readonly added = signal('');
  protected readonly error = signal('');

  protected setUnit(unit: Unit): void {
    this.unit.set(unit);
    try {
      localStorage.setItem(UNIT_KEY, unit);
    } catch {
      // Préférence non gardée : sans gravité
    }
  }

  protected consumption(kmPerL: number | null): string | null {
    if (!kmPerL) return null;
    return this.unit() === 'kml' ? formatNumber(kmPerL, 1) : formatNumber(100 / kmPerL, 2);
  }

  protected readonly unitLabel = computed(() => (this.unit() === 'kml' ? 'km/L' : 'L/100 km'));

  protected num(n: number): string {
    return formatNumber(n);
  }

  /** Détails d'une ligne du journal : distance, essence restante, essence ajoutée */
  protected details(e: MotoEvent): string {
    const parts: string[] = [dayLabel(e.date)];
    if (e.distance !== null) parts.push(`+${formatNumber(e.distance)} km`);
    if (e.fuelLeft !== null) parts.push(`restait ${formatNumber(e.fuelLeft)} L`);
    if (e.op) parts.push(formatMoney(e.op.amount));
    return parts.join(' · ');
  }

  protected open(e: MotoEvent): void {
    if (e.op) return this.ui.openEdit(e.op.id);
    if (e.reading) this.edit(e.reading);
  }

  protected startPriceEdit(): void {
    this.priceText.set(amountToInput(this.store.fuelPrice().price));
    this.editingPrice.set(true);
  }

  protected savePrice(): void {
    const price = parseAmount(this.priceText());
    if (price === null) return this.ui.notify('Prix du litre invalide', true);
    this.store.setFuelPrice(price);
    this.editingPrice.set(false);
    this.ui.notify(`Prix du litre : ${formatMoney(price)}`);
  }

  private edit(reading: MotoReading): void {
    const today = todayISO();
    this.editing.set(reading);
    this.dateChoice.set(reading.date === today ? 'today' : reading.date === addDaysISO(today, -1) ? 'yesterday' : 'other');
    this.otherDate.set(isoToFr(reading.date));
    this.km.set(reading.km === null ? '' : amountToInput(reading.km));
    this.left.set(reading.fuelLeft === null ? '' : amountToInput(reading.fuelLeft));
    this.added.set(reading.added === null ? '' : amountToInput(reading.added));
    this.error.set('');
    this.form()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected reset(): void {
    this.editing.set(null);
    this.dateChoice.set('today');
    for (const field of [this.otherDate, this.km, this.left, this.added, this.error]) field.set('');
  }

  protected submit(): void {
    const choice = this.dateChoice();
    const date =
      choice === 'today' ? todayISO() : choice === 'yesterday' ? addDaysISO(todayISO(), -1) : parseFrDate(this.otherDate().trim());
    const read = (text: string) => (text.trim() === '' ? null : parseNumber(text));
    const km = read(this.km());
    const fuelLeft = read(this.left());
    const added = read(this.added());

    if (!date) return this.error.set(DATE_ERROR);
    if (this.km().trim() !== '' && km === null) return this.error.set('Kilométrage invalide');
    if (this.left().trim() !== '' && fuelLeft === null) return this.error.set('Essence restante invalide');
    if (this.added().trim() !== '' && added === null) return this.error.set('Essence ajoutée invalide');
    if (km === null && !added) return this.error.set('Indique le kilométrage (ou l’essence ajoutée)');
    const editing = this.editing();
    const kmError = this.store.kmError(date, km, editing ? 'r' + editing.id : undefined);
    if (kmError) return this.error.set(kmError);

    const reading = { date, km, fuelLeft, added: added || null };
    if (editing) this.store.updateReading(editing.id, reading);
    else this.store.addReading(reading);
    this.ui.notify(editing ? 'Relevé modifié' : 'Relevé enregistré');
    this.reset();
  }

  protected remove(): void {
    const editing = this.editing();
    if (!editing) return;
    const removed = this.store.removeReading(editing.id);
    this.reset();
    if (removed) this.ui.notify('Relevé supprimé', false, () => this.store.restoreReading(removed));
  }
}
