import { Component, effect, inject, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { BudgetStore } from '../../budget-store';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_NAME_MAX } from '../../models';
import { UiService } from '../../ui.service';
import { IconComponent } from '../icon/icon';

/**
 * Fenêtre « Nouvelle catégorie » : un nom, une icône et une couleur.
 * La catégorie apparaît ensuite partout (budget, bouton +, formulaires) et sur tous les appareils synchronisés.
 *
 * Utilisation : <app-category-sheet [(open)]="creating" />
 */
@Component({
  selector: 'app-category-sheet',
  imports: [FormsModule, IconComponent],
  host: { '(document:keydown.escape)': 'open.set(false)' },
  template: `
    @if (open()) {
      <div class="modal" (click)="onBackdropClick($event)">
        <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="category-title">
          <div class="label">Budget</div>
          <h2 id="category-title" class="sheet-title">Nouvelle catégorie</h2>

          <form class="stack" (ngSubmit)="create()">
            <div class="field">
              <label class="label" for="category-name">Nom</label>
              <input
                type="text"
                id="category-name"
                name="categoryName"
                autocomplete="off"
                placeholder="Ex: Santé"
                [maxlength]="maxLength"
                [ngModel]="name()"
                (ngModelChange)="name.set($event)"
              />
            </div>

            <div class="field">
              <span class="label" id="category-icon">Icône</span>
              <div class="pick-grid" role="radiogroup" aria-labelledby="category-icon">
                @for (i of icons; track i) {
                  <button
                    type="button"
                    class="pick"
                    role="radio"
                    [style.--c]="color()"
                    [attr.aria-checked]="icon() === i"
                    [attr.aria-label]="i"
                    (click)="icon.set(i)"
                  >
                    <app-icon [name]="i" />
                  </button>
                }
              </div>
            </div>

            <div class="field">
              <span class="label" id="category-color">Couleur</span>
              <div class="pick-grid" role="radiogroup" aria-labelledby="category-color">
                @for (c of colors; track c) {
                  <button
                    type="button"
                    class="pick swatch"
                    role="radio"
                    [style.--c]="c"
                    [attr.aria-checked]="color() === c"
                    [attr.aria-label]="'Couleur ' + ($index + 1)"
                    (click)="color.set(c)"
                  ></button>
                }
              </div>
            </div>

            <p class="hint">
              Elle démarre à 0 dans le budget du mois. Pour lui donner un montant ce mois-ci, il faudra utiliser une
              des modifications du budget.
            </p>
            @if (error()) {
              <p class="form-error" role="alert">{{ error() }}</p>
            }
            <button type="submit" class="btn primary big">Créer la catégorie</button>
            <button type="button" class="btn" (click)="open.set(false)">Annuler</button>
          </form>
        </div>
      </div>
    }
  `,
})
export class CategorySheetComponent {
  readonly open = model(false);

  private readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);

  protected readonly icons = CATEGORY_ICONS;
  protected readonly colors = CATEGORY_COLORS;
  protected readonly maxLength = CATEGORY_NAME_MAX;

  protected readonly name = signal('');
  protected readonly icon = signal(CATEGORY_ICONS[0]);
  protected readonly color = signal(CATEGORY_COLORS[0]);
  protected readonly error = signal('');

  constructor() {
    // Formulaire vide à chaque ouverture, avec une couleur pas encore prise si possible
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        const used = new Set(this.store.categories().map((c) => c.color));
        this.name.set('');
        this.icon.set(CATEGORY_ICONS[0]);
        this.color.set(CATEGORY_COLORS.find((c) => !used.has(c)) ?? CATEGORY_COLORS[0]);
        this.error.set('');
      });
    });
  }

  /** Clic sur le fond : ferme. (Une expression qui renvoie false annulerait l'envoi du formulaire.) */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.open.set(false);
  }

  protected create(): void {
    const error = this.store.addCategory(this.name(), this.icon(), this.color());
    if (error) return this.error.set(error);
    this.ui.notify(`Catégorie « ${this.name().trim()} » créée`);
    this.open.set(false);
  }
}
