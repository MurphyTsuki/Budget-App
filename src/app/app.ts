import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter, map } from 'rxjs';

import { EditOpModalComponent } from './components/edit-op-modal/edit-op-modal';
import { IconComponent } from './components/icon/icon';
import { UiService } from './ui.service';

type Tab = 'accueil' | 'budget' | 'ajouter' | 'depenses' | 'comptes';

/** Thème de chaque compte : la BRED, Dota 2 (espèces) et MVola */
const THEMES: Record<string, string> = { banque: 'bred', especes: 'especes', mvola: 'mvola' };

/** Couleur d'accent de chaque thème (la même que --accent dans styles.css) */
const ACCENTS: Record<string, string> = { '': '#7fd4a8', bred: '#00c1f2', especes: '#e2432c', mvola: '#ffd200' };

/** Mélange deux couleurs hexadécimales (part = poids de la seconde, de 0 à 1) */
function mix(hex: string, other: string, part: number): string {
  const channel = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) => Math.round(channel(hex, i) * (1 - part) + channel(other, i) * part));
  return '#' + out.map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** Coquille de l'application : page courante, barre de navigation flottante, messages. */
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  imports: [RouterOutlet, RouterLink, EditOpModalComponent, IconComponent],
})
export class App {
  protected readonly ui = inject(UiService);
  private readonly router = inject(Router);
  private readonly updates = inject(SwUpdate);

  /** Une nouvelle version de Volako est téléchargée : elle s'appliquera au rechargement */
  protected readonly updateReady = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  private readonly path = computed(() => this.url().split('?')[0].split('/').filter(Boolean));

  /** Onglet à mettre en évidence (les sous-pages font partie de leur onglet) */
  protected readonly tab = computed<Tab>(() => {
    const page = this.path()[0];
    return (['budget', 'ajouter', 'depenses', 'comptes'] as const).find((t) => t === page) ?? 'accueil';
  });

  protected readonly tabs: { id: Tab; label: string; icon: string; link: string }[] = [
    { id: 'accueil', label: 'Accueil', icon: 'home', link: '/accueil' },
    { id: 'budget', label: 'Budget', icon: 'target', link: '/budget' },
    { id: 'ajouter', label: 'Ajouter', icon: 'plus', link: '/ajouter' },
    { id: 'depenses', label: 'Dépenses', icon: 'list', link: '/depenses' },
    { id: 'comptes', label: 'Comptes', icon: 'wallet', link: '/comptes' },
  ];

  protected reload(): void {
    document.location.reload();
  }

  private readonly theme = computed(() => {
    const [page, account] = this.path();
    return page === 'comptes' ? (THEMES[account] ?? '') : '';
  });

  /**
   * Couleurs du disque « + ». Elles sont écrites directement dans le SVG : des couleurs lues dans
   * les variables CSS font clignoter le dégradé sur Chrome Android (rendu recalculé en boucle).
   */
  protected readonly plusColors = computed(() => {
    const accent = ACCENTS[this.theme()];
    return { light: mix(accent, '#ffffff', 0.55), main: accent, dark: mix(accent, '#000000', 0.35) };
  });

  constructor() {
    // PWA : prévenir quand une nouvelle version est prête, et la chercher à chaque retour sur l'appli
    if (this.updates.isEnabled) {
      this.updates.versionUpdates
        .pipe(filter((event) => event.type === 'VERSION_READY'))
        .subscribe(() => this.updateReady.set(true));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.updates.checkForUpdate();
      });
    }

    // Chaque compte a ses couleurs : la BRED, Dota 2 (espèces) et MVola
    effect(() => {
      const theme = this.theme();
      if (theme) document.body.dataset['theme'] = theme;
      else delete document.body.dataset['theme'];
    });
  }
}
