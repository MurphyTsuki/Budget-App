import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BudgetStore } from '../../budget-store';
import { IconComponent } from '../../components/icon/icon';
import { ParsedCsv, exportCsv, parseCsv } from '../../csv';
import { MoneyPipe } from '../../pipes';
import { UiService } from '../../ui.service';
import { monthLabel, todayISO } from '../../utils';

/**
 * Page « Comptes » : la banque, les espèces et MVola (chaque carte mène au compte),
 * puis l'export et l'import des données en CSV.
 */
@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.html',
  imports: [RouterLink, IconComponent, MoneyPipe],
  host: { '(document:keydown.escape)': 'closeImport()' },
})
export class AccountsComponent {
  protected readonly store = inject(BudgetStore);
  private readonly ui = inject(UiService);

  /** Fichier lu, en attente du choix « ajouter » ou « remplacer » */
  protected readonly imported = signal<{ name: string; data: ParsedCsv } | null>(null);
  /** Premier clic sur « Tout remplacer » : on demande confirmation */
  protected readonly confirmingReplace = signal(false);

  protected readonly monthLabel = monthLabel;

  protected exportData(): void {
    const csv = exportCsv({
      operations: this.store.operations(),
      references: this.store.references(),
      budgets: this.store.budgets(),
    });
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
    if (data.operationCount === 0 && data.budgetLines === 0) {
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
