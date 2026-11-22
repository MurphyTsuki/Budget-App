import { Component, computed, input } from '@angular/core';

/** Contour du cristal : sommet (195,205), pointe (195,615) */
const SHAPE = 'M195 205 L300 290 L300 520 L195 615 L90 520 L90 290 Z';
const TOP = 205;
const BOTTOM = 615;

/** Surface du liquide, tracée à y = 0 puis descendue au bon niveau (ce qui permet de l'animer). */
function wave(amplitude: number, phase: number, close: boolean): string {
  let d = 'M-20 0';
  for (let k = 0; k < 14; k++) d += ` q17.5 ${(k + phase) % 2 ? -amplitude : amplitude} 35 0`;
  return close ? d + ' V440 H-20 Z' : d;
}

/** Couleurs : [principale, claire, foncée] */
type Palette = [string, string, string];

const PALETTES: Record<'empty' | 'green' | 'yellow' | 'red' | 'over', Palette> = {
  empty: ['#a3978a', '#e6ddd2', '#6f655b'],
  green: ['#7fd4a8', '#dcf8e9', '#3f9a6f'],
  yellow: ['#f5cf62', '#fff1b8', '#c99a2e'],
  red: ['#ee9282', '#ffd6cd', '#b8695c'],
  over: ['#ef5f50', '#ffb0a6', '#a83a2e'],
};

/**
 * Grand cristal de l'accueil : il se remplit avec la part du budget consommée.
 * Vert sous 40 %, jaune jusqu'à 70 %, rouge doux jusqu'à 100 %, puis rouge vif, fissuré et tremblant.
 *
 * Utilisation : <app-crystal [percent]="63" />  (null = pas de budget)
 */
@Component({
  selector: 'app-crystal',
  templateUrl: './crystal.html',
  host: { class: 'crystal' },
})
export class CrystalComponent {
  readonly percent = input<number | null>(null);

  protected readonly shape = SHAPE;
  protected readonly back = wave(7, 1, true);
  protected readonly front = wave(9, 0, true);
  protected readonly surface = wave(9, 0, false);

  protected readonly state = computed(() => {
    const p = this.percent();
    if (p === null) return 'empty';
    if (p < 40) return 'green';
    if (p <= 70) return 'yellow';
    return p <= 100 ? 'red' : 'over';
  });

  protected readonly colors = computed(() => {
    const [main, light, dark] = PALETTES[this.state()];
    return { main, light, dark };
  });

  /** Hauteur de la surface du liquide (le cristal plein s'arrête à son sommet) */
  protected readonly level = computed(() => {
    const p = Math.min(Math.max(this.percent() ?? 0, 0), 100);
    return Math.round(BOTTOM - (p / 100) * (BOTTOM - TOP));
  });

  protected readonly over = computed(() => this.state() === 'over');
}
