import { Injectable, signal } from '@angular/core';

import { setSaveErrorHandler } from './storage';

export interface Toast {
  message: string;
  error: boolean;
  /** Action « Annuler » (absente si le message n'est pas annulable) */
  undo?: () => void;
}

/** État de l'interface partagé entre les composants (fenêtre de modification, messages). */
@Injectable({ providedIn: 'root' })
export class UiService {
  /** Identifiant de la dépense en cours de modification, ou null si la fenêtre est fermée. */
  readonly editingId = signal<number | null>(null);

  /** Message affiché en bas de l'écran, au-dessus de la barre de navigation. */
  readonly toast = signal<Toast | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    setSaveErrorHandler(() => this.notify("Impossible d'enregistrer les données sur cet appareil.", true));
  }

  openEdit(id: number): void {
    this.editingId.set(id);
  }

  closeEdit(): void {
    this.editingId.set(null);
  }

  /** Message qui disparaît tout seul (plus longtemps s'il propose « Annuler »). */
  notify(message: string, error = false, undo?: () => void): void {
    this.toast.set({ message, error, undo });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.toast.set(null), undo ? 5000 : 2500);
  }

  undoToast(): void {
    const toast = this.toast();
    this.toast.set(null);
    clearTimeout(this.timer);
    toast?.undo?.();
  }
}
