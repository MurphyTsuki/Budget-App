import { Component, model } from '@angular/core';

import { Operation } from '../../models';

export type SortKey = 'date' | 'montant' | 'alpha';

export interface Sort {
  key: SortKey;
  /** true : plus récent, plus gros montant ou Z→A d'abord */
  desc: boolean;
}

/** Sens naturel de chaque tri : le plus récent, le plus gros, de A à Z */
const NATURAL: Record<SortKey, boolean> = { date: true, montant: true, alpha: false };

export const DEFAULT_SORT: Sort = { key: 'date', desc: true };

/** Trie les opérations ; par date, les frais MVola restent juste sous leur opération. */
export function sortOperations(ops: readonly Operation[], sort: Sort): Operation[] {
  const dir = sort.desc ? -1 : 1;
  const group = (op: Operation) => op.parentId ?? op.id;
  const newestFirst = (a: Operation, b: Operation) => b.date.localeCompare(a.date) || b.id - a.id;

  return [...ops].sort((a, b) => {
    switch (sort.key) {
      case 'date':
        return (
          dir * (a.date.localeCompare(b.date) || group(a) - group(b)) ||
          Number(a.parentId !== null) - Number(b.parentId !== null)
        );
      case 'montant':
        return dir * (a.amount - b.amount) || newestFirst(a, b);
      case 'alpha':
        return dir * a.description.localeCompare(b.description, 'fr', { sensitivity: 'base' }) || newestFirst(a, b);
    }
  });
}

/**
 * Choix du tri : date, montant ou ordre alphabétique. Toucher le tri actif inverse son sens.
 *
 * Utilisation : <app-sort-chips [(sort)]="sort" />
 */
@Component({
  selector: 'app-sort-chips',
  template: `
    <span class="label">Trier</span>
    @for (o of options; track o.key) {
      <button
        type="button"
        class="chip"
        [attr.aria-pressed]="sort().key === o.key"
        [attr.aria-label]="'Trier par ' + o.name"
        (click)="choose(o.key)"
      >
        {{ sort().key === o.key ? (sort().desc ? o.desc : o.asc) : o.label }}
      </button>
    }
  `,
  host: { class: 'sort-chips', role: 'group', 'aria-label': 'Tri' },
})
export class SortChipsComponent {
  readonly sort = model<Sort>(DEFAULT_SORT);

  protected readonly options: { key: SortKey; name: string; label: string; desc: string; asc: string }[] = [
    { key: 'date', name: 'date', label: 'Date', desc: 'Date ↓', asc: 'Date ↑' },
    { key: 'montant', name: 'montant', label: 'Montant', desc: 'Montant ↓', asc: 'Montant ↑' },
    { key: 'alpha', name: 'ordre alphabétique', label: 'A→Z', desc: 'Z→A', asc: 'A→Z' },
  ];

  protected choose(key: SortKey): void {
    const current = this.sort();
    this.sort.set(current.key === key ? { key, desc: !current.desc } : { key, desc: NATURAL[key] });
  }
}
