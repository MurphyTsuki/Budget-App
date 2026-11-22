import { Component, effect, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { PhotoService } from '../../photos';
import { IconComponent } from '../icon/icon';

/**
 * Choix d'une photo pour une dépense (appareil photo ou galerie), avec aperçu et nom facultatif.
 * La photo n'est envoyée dans Drive qu'à l'enregistrement de la dépense.
 *
 * Utilisation : <app-photo-field inputId="add-photo" [(file)]="photo" [(name)]="photoName" />
 */
@Component({
  selector: 'app-photo-field',
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    @if (!photos.configured()) {
      <p class="hint">
        Photos : <a routerLink="/comptes" class="link">relie Google Drive dans Comptes</a> pour en ajouter
      </p>
    } @else if (file()) {
      <div class="photo-picked">
        <img [src]="preview()" alt="Aperçu de la photo" />
        <input
          type="text"
          [id]="inputId() + '-name'"
          [name]="inputId() + '-name'"
          autocomplete="off"
          placeholder="Nom de la photo (facultatif)"
          aria-label="Nom de la photo"
          [ngModel]="name()"
          (ngModelChange)="name.set($event)"
        />
        <button type="button" class="round-btn" aria-label="Retirer la photo" (click)="file.set(null)">
          <app-icon name="close" />
        </button>
      </div>
    } @else {
      <label class="btn photo-btn">
        <app-icon name="camera" /> {{ label() }}
        <input type="file" accept="image/*" [id]="inputId()" (change)="pick($event)" />
      </label>
    }
  `,
})
export class PhotoFieldComponent {
  readonly file = model<Blob | null>(null);
  readonly name = model('');
  readonly inputId = input('photo');
  readonly label = input('Ajouter une photo');

  protected readonly photos = inject(PhotoService);
  protected readonly preview = signal('');

  constructor() {
    // Aperçu : une adresse locale vers le fichier, libérée quand la photo change
    effect((onCleanup) => {
      const file = this.file();
      if (!file) {
        this.preview.set('');
        return;
      }
      const url = URL.createObjectURL(file);
      this.preview.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      this.file.set(file);
      this.name.set('');
    }
  }
}
