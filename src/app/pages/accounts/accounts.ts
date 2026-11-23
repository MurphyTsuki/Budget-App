import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { ParsedCsv, exportCsv, parseCsv } from '../../csv';
import { PhotoService } from '../../photos';
import { SyncService } from '../../sync';
import { MoneyPipe } from '../../pipes';
import { UiService } from '../../ui.service';
import { monthLabel, todayISO } from '../../utils';

/**
 * Page « Comptes » : la banque, les espèces et MVola (chaque carte mène au compte),
 * puis les photos Google Drive et l'export / import des données en CSV.
 */
@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.html',
  imports: [RouterLink, IconComponent, MoneyPipe],
  host: { '(document:keydown.escape)': 'closeImport(); driveOpen.set(false)' },
})
export class AccountsComponent {
  protected readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);

  /** Fichier lu, en attente du choix « ajouter » ou « remplacer » */
  protected readonly imported = signal<{ name: string; data: ParsedCsv } | null>(null);
  /** Premier clic sur « Tout remplacer » : on demande confirmation */
  protected readonly confirmingReplace = signal(false);

  protected readonly monthLabel = monthLabel;

  // Réglages des photos Google Drive
  protected readonly photos = inject(PhotoService);
  protected readonly driveOpen = signal(false);
  protected readonly driveUrl = signal('');
  protected readonly driveMessage = signal<{ text: string; error: boolean } | null>(null);
  protected readonly testing = signal(false);
  protected readonly secretDraft = signal('');

  // Synchro téléphone ↔ PC
  protected readonly sync = inject(SyncService);

  /** « il y a 3 min » */
  protected since(time: number): string {
    if (!time) return 'jamais';
    const minutes = Math.round((Date.now() - time) / 60000);
    if (minutes < 1) return 'à l’instant';
    if (minutes < 60) return `il y a ${minutes} min`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `il y a ${hours} h` : `il y a ${Math.round(hours / 24)} j`;
  }

  /** Reprend la clé déjà enregistrée dans le script (deuxième appareil) */
  protected saveSecret(): void {
    const secret = this.secretDraft().trim();
    if (secret.length < 12) {
      this.driveMessage.set({ text: 'La clé doit faire au moins 12 caractères', error: true });
      return;
    }
    this.photos.setSecret(secret);
    this.driveMessage.set({ text: 'Clé enregistrée : touche « Tester et enregistrer »', error: false });
  }

  /** Clic sur le fond de la fenêtre Drive : ferme (sans annuler les clics sur ce qu'elle contient) */
  protected onDriveBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.driveOpen.set(false);
  }

  protected openDrive(): void {
    this.driveUrl.set(this.photos.settings().url);
    this.secretDraft.set(this.photos.settings().secret);
    this.driveMessage.set(null);
    this.driveOpen.set(true);
  }

  protected async copySecret(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.photos.settings().secret);
      this.ui.notify('Clé copiée');
    } catch {
      this.ui.notify('Copie impossible : sélectionne la clé à la main', true);
    }
  }

  /** Teste l'adresse saisie, puis l'enregistre si le script répond */
  protected async saveDrive(): Promise<void> {
    const url = this.driveUrl().trim();
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(url)) {
      this.driveMessage.set({ text: 'L’adresse doit commencer par https://script.google.com et finir par /exec', error: true });
      return;
    }
    this.testing.set(true);
    const error = await this.photos.test(url);
    this.testing.set(false);
    if (error) {
      this.driveMessage.set({ text: error, error: true });
      return;
    }
    this.photos.setUrl(url);
    this.driveMessage.set({ text: 'Connexion réussie : photos et synchro passent par ton Drive', error: false });
    void this.sync.sync();
  }

  protected exportData(): void {
    const csv = exportCsv(this.store.syncState());
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `volako-${todayISO()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.ui.notify('Fichier CSV exporté');
  }

  protected async readFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const data = parseCsv(await file.text());
    if (data.operationCount === 0 && data.budgetLines === 0 && data.readingCount === 0) {
      this.ui.notify(data.errors[0] ?? 'Aucune donnée trouvée dans ce fichier', true);
      return;
    }
    this.confirmingReplace.set(false);
    this.imported.set({ name: file.name, data });
  }

  protected addMissing(): void {
    const file = this.imported();
    if (!file) return;
    const added = this.store.addMissing(file.data);
    this.imported.set(null);
    this.ui.notify(
      added === 0 ? 'Rien de nouveau : tout était déjà là' : `${added} opération${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}`,
    );
  }

  protected replaceAll(): void {
    const file = this.imported();
    if (!file) return;
    if (!this.confirmingReplace()) {
      this.confirmingReplace.set(true);
      return;
    }
    this.store.replaceAll(file.data);
    this.imported.set(null);
    this.ui.notify('Données remplacées par celles du fichier');
  }

  protected closeImport(): void {
    this.imported.set(null);
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closeImport();
  }
}
