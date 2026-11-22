import { Component, computed, inject, input } from '@angular/core';

import { BudgetStore } from '../../budget-store';
import { PhotoService } from '../../photos';
import { ACCOUNTS, Channel, Operation, findCategory } from '../../models';
import { MoneyPipe } from '../../pipes';
import { UiService } from '../../ui.service';
import { formatMoney, isoToFr } from '../../utils';
import { IconComponent } from '../icon/icon';

const CHANNEL_LABELS: Record<Channel, string> = {
  especes: 'espèces',
  'achat-en-ligne': 'achat en ligne',
  virement: 'virement',
  transfert: 'MVola',
  frais: 'frais auto',
};

const MOVE_LABELS = {
  'retrait-banque': { sub: 'Banque → espèces', icon: 'out' },
  'depot-mvola': { sub: 'Espèces → MVola', icon: 'down' },
  'retrait-mvola': { sub: 'MVola → espèces', icon: 'up' },
};

/**
 * Ligne d'une opération : un clic (ou Entrée) ouvre la fenêtre de modification.
 *
 * Utilisation : <app-op-row [op]="op" [showDate]="true" />
 */
@Component({
  selector: 'app-op-row',
  template: `
    <span class="bubble" [class.tinted]="look().color" [style.--c]="look().color"><app-icon [name]="look().icon" /></span>
    <span class="op-info">
      <span class="op-title">
        {{ op().description }}
        @if (op().photo) {
          <app-icon name="camera" class="op-flag" title="Photo dans Drive" />
        } @else if (pending()) {
          <app-icon name="clock" class="op-flag" title="Photo en attente d’envoi" />
        }
      </span>
      <span class="op-sub">{{ look().sub }}@if (fees(); as f) { · frais {{ f }}}@if (showDate()) { · {{ date() }}}</span>
    </span>
    <span class="op-amount num" [class.in]="op().kind === 'revenu'" [class.muted]="look().move">
      {{ look().sign }}{{ op().amount | money }}
    </span>
  `,
  imports: [MoneyPipe, IconComponent],
  host: {
    class: 'op clickable',
    role: 'button',
    tabindex: '0',
    '[class.move]': 'look().move',
    title: 'Modifier cette opération',
    '(click)': 'edit()',
    '(keydown.enter)': 'edit()',
  },
})
export class OpRowComponent {
  readonly op = input.required<Operation>();
  /** Ajoute la date sous la description */
  readonly showDate = input(false);

  private readonly ui = inject(UiService);
  private readonly store = inject(BudgetStore);
  private readonly photos = inject(PhotoService);

  /** Photo encore sur le téléphone, en attente d'envoi dans Drive */
  protected readonly pending = computed(() => this.photos.pending().has(this.op().id));

  /** Frais MVola liés à ce retrait ou à ce transfert */
  protected readonly fees = computed(() => {
    const fee = this.store.feeOf(this.op().id);
    return fee ? formatMoney(fee.amount) : null;
  });

  protected readonly date = computed(() => isoToFr(this.op().date).slice(0, 5));

  protected readonly look = computed(() => {
    const op = this.op();
    if (op.kind === 'depense') {
      const category = findCategory(op.category);
      const how = op.channel ? CHANNEL_LABELS[op.channel] : ACCOUNTS[op.account].name;
      return { icon: category.icon, color: category.color, sub: `${category.name} · ${how}`, sign: '− ', move: false };
    }
    if (op.kind === 'revenu') {
      return { icon: 'coin', color: null, sub: `Revenu · ${ACCOUNTS[op.account].name}`, sign: '+ ', move: false };
    }
    const move = MOVE_LABELS[op.kind];
    return { icon: move.icon, color: null, sub: `${move.sub} · hors budget`, sign: '', move: true };
  });

  protected edit(): void {
    this.ui.openEdit(this.op().id);
  }
}
