import { Component, ElementRef, computed, inject, input, model, signal } from '@angular/core';

import { FIRST_MONTH, MONTHS, pad2, parseFrDate, isoToFr, todayISO } from '../../utils';

/** Premier mois affichable (aucune saisie avant) */
const [FIRST_YEAR, FIRST_MONTH_INDEX] = [Number(FIRST_MONTH.slice(0, 4)), Number(FIRST_MONTH.slice(5)) - 1];

/**
 * Champ de date au format JJ/MM/AAAA avec un calendrier intégré (bouton à droite).
 * Les "/" sont ajoutés automatiquement pendant la saisie (12102026 -> 12/10/2026).
 *
 * Utilisation : <app-date-field inputId="expense-date" [(value)]="date" />
 * La valeur est le texte saisi ; utiliser parseFrDate() pour obtenir la date ISO.
 */
@Component({
  selector: 'app-date-field',
  templateUrl: './date-field.html',
})
export class DateFieldComponent {
  /** Texte saisi (ex. "13/10/2026") */
  readonly value = model('');
  readonly inputId = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly isOpen = signal(false);
  private readonly year = signal(new Date().getFullYear());
  private readonly month = signal(new Date().getMonth());

  /** Date de 10 caractères qui n'existe pas (ex. 31/02/2026) */
  protected readonly invalid = computed(() => {
    const text = this.value().trim();
    return text.length === 10 && parseFrDate(text) === null;
  });

  protected readonly title = computed(() => `${MONTHS[this.month()]} ${this.year()}`);

  /** On ne remonte pas avant le premier mois suivi */
  protected readonly canGoBack = computed(() => this.year() * 12 + this.month() > FIRST_YEAR * 12 + FIRST_MONTH_INDEX);

  /** Cases vides avant le 1er du mois (la semaine commence le lundi) */
  protected readonly blanks = computed(() => {
    const firstDay = new Date(this.year(), this.month(), 1).getDay();
    return Array.from({ length: (firstDay + 6) % 7 });
  });

  protected readonly days = computed(() => {
    const year = this.year();
    const month = this.month();
    const selected = parseFrDate(this.value());
    const today = todayISO();
    const count = new Date(year, month + 1, 0).getDate();

    return Array.from({ length: count }, (_, i) => {
      const day = i + 1;
      const iso = `${String(year).padStart(4, '0')}-${pad2(month + 1)}-${pad2(day)}`;
      return {
        day,
        iso,
        today: iso === today,
        selected: iso === selected,
        label: `${day} ${MONTHS[month].toLowerCase()} ${year}`,
      };
    });
  });

  protected onInput(event: Event): void {
    const field = event.target as HTMLInputElement;
    const digits = field.value.replace(/\D/g, '').slice(0, 8);
    let text = digits.slice(0, 2);
    if (digits.length > 2) text += '/' + digits.slice(2, 4);
    if (digits.length > 4) text += '/' + digits.slice(4);
    field.value = text;
    this.value.set(text);
  }

  protected open(): void {
    // Le calendrier s'ouvre sur la date déjà saisie, sinon sur aujourd'hui
    const [year, month] = (parseFrDate(this.value()) ?? todayISO()).split('-').map(Number);
    this.year.set(year);
    this.month.set(month - 1);
    this.isOpen.set(true);

    // Place le focus dans le calendrier (le jour choisi, ou aujourd'hui)
    setTimeout(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>('.cal-day.selected, .cal-day.today, .cal-day')
        ?.focus(),
    );
  }

  protected close(): void {
    this.isOpen.set(false);
  }

  /** Échap ferme le calendrier sans fermer la fenêtre qui le contient */
  protected onEscape(event: Event): void {
    event.stopPropagation();
    this.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  /** Avance (ou recule) de n mois : ±1 = mois, ±12 = année */
  protected shift(months: number): void {
    const target = Math.max(this.year() * 12 + this.month() + months, FIRST_YEAR * 12 + FIRST_MONTH_INDEX);
    this.year.set(Math.floor(target / 12));
    this.month.set(target % 12);
  }

  protected pick(iso: string): void {
    this.value.set(isoToFr(iso));
    this.close();
  }

  protected pickToday(): void {
    this.pick(todayISO());
  }
}
