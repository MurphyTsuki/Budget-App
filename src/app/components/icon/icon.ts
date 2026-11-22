import { Component, computed, input } from '@angular/core';

/* Tracés des icônes (grille 24×24, trait de 1,7) */
const ICONS: Record<string, string[]> = {
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-5h4v5'],
  pie: ['M12 3a9 9 0 1 0 9 9h-9z', 'M15 3.5A9 9 0 0 1 20.5 9H15z'],
  plus: ['M12 5v14M5 12h14'],
  wallet: ['M6 6h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z', 'M3 10h18', 'M16.5 13.3a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4'],
  list: ['M8 6h12M8 12h12M8 18h12', 'M4 6h.01M4 12h.01M4 18h.01'],
  basket: ['M4 9h16l-1.5 10h-13z', 'M8 9l3-5M16 9l-3-5'],
  bus: ['M8 3h8a3 3 0 0 1 3 3v11H5V6a3 3 0 0 1 3-3z', 'M5 11h14', 'M8.5 14h.01M15.5 14h.01', 'M7 17v3M17 17v3'],
  star: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
  bolt: ['M13 3L5 14h6l-1 7 8-11h-6z'],
  dots: ['M6 12h.01M12 12h.01M18 12h.01'],
  tag: ['M3 12V4h8l10 10-8 8z', 'M7.5 7.5h.01'],
  gem: ['M6 4h12l3 5-9 11L3 9z', 'M3 9h18M9 4l3 16 3-16'],
  coin: ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3'],
  left: ['M15 5l-7 7 7 7'],
  right: ['M9 5l7 7-7 7'],
  calendar: ['M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z', 'M3 10h18M8 3v4M16 3v4'],
  pen: ['M4 20l4-1 11-11-3-3L5 16z'],
  trash: ['M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13'],
  close: ['M6 6l12 12M18 6L6 18'],
  arrow: ['M4 12h16M14 6l6 6-6 6'],
  target: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10', 'M12 12h.01'],
  heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  leaf: ['M5 19c0-9 5-14 15-14 0 10-5 15-14 15', 'M5 19l7-7'],
  wifi: ['M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0', 'M12 19h.01'],
  drop: ['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', 'M12.5 10l-2 4h3l-2 4'],
  house: ['M4 11l8-6 8 6v9H4z', 'M9 20v-5h6v5'],
  tennis: ['M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17', 'M4.5 8.5c3.5 1 5 4 3.8 8.8M19.5 15.5c-3.5-1-5-4-3.8-8.8'],
  phone: ['M9.5 3h5A2.5 2.5 0 0 1 17 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 18.5v-13A2.5 2.5 0 0 1 9.5 3z', 'M11 17.5h2'],
  alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17h.01'],
  wrench: ['M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3l7.5-7.5a4 4 0 0 1-2-2z'],
  fuel: ['M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M5 10h9', 'M14 9h2l2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3'],
  pin: ['M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z', 'M12 7.8a2.2 2.2 0 1 0 0 4.4a2.2 2.2 0 1 0 0-4.4'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20a2 2 0 0 0 4 0'],
  lock: ['M7.5 10h9a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5v-5A2.5 2.5 0 0 1 7.5 10z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  cart: ['M3 4h2l2.4 11h10.2L20 8H6.2', 'M9 17.7a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6M17 17.7a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6'],
  out: ['M5 5h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M12 12v8M9 17l3 3 3-3'],
  send: ['M4 12h15M13 6l6 6-6 6'],
  down: ['M12 4v15M6 13l6 6 6-6'],
  up: ['M12 20V5M6 11l6-6 6 6'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 9.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M12 7v5l3 2'],
};

/** Icône au trait (couleur = couleur du texte). Utilisation : <app-icon name="basket" /> */
@Component({
  selector: 'app-icon',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  host: { class: 'icon' },
})
export class IconComponent {
  readonly name = input.required<string>();

  protected readonly paths = computed(() => ICONS[this.name()] ?? ICONS['tag']);
}
