import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { EditOpModalComponent } from './components/edit-op-modal/edit-op-modal';
import { IconComponent } from './components/icon/icon';
import { UiService } from './ui.service';

type Tab = 'accueil' | 'budget' | 'ajouter' | 'depenses' | 'comptes';

/** Coquille de l'application : page courante, barre de navigation flottante, messages. */
@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  imports: [RouterOutlet, RouterLink, EditOpModalComponent, IconComponent],
})
export class App {
  protected readonly ui = inject(UiService);
  private readonly router = inject(Router);

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

  constructor() {
    // Chaque compte a ses couleurs : la BRED, Dota 2 (espèces) et MVola
    effect(() => {
      const [page, account] = this.path();
      const themes: Record<string, string> = { banque: 'bred', especes: 'especes', mvola: 'mvola' };
      const theme = page === 'comptes' ? themes[account] : undefined;
      if (theme) document.body.dataset['theme'] = theme;
      else delete document.body.dataset['theme'];
    });
  }
}
