import { Injectable, effect, inject, signal, untracked } from '@angular/core';

import { BudgetStore, SyncState } from './budget-store';
import { exportCsv } from './csv';
import { PhotoService } from './photos';
import {
  normalizeBudgets,
  normalizeDeletions,
  normalizeOperations,
  normalizeReferenceTimes,
  normalizeReferences,
} from './storage';
import { mergeStates, serializeState } from './sync-merge';

/** Contenu du fichier Volako / volako-donnees.json dans Drive */
interface SyncFile {
  format: 'volako-sync';
  version: 1;
  /** Instant de l'enregistrement : le script refuse d'écraser une version plus récente que celle lue */
  savedAt: number;
  state: SyncState;
}

const LAST_SYNC_KEY = 'lastSync';
/** Attente après une modification avant d'envoyer (plusieurs saisies d'affilée = un seul envoi) */
const DEBOUNCE = 2000;
/** Nouvel essai si un autre appareil a enregistré pendant la synchro */
const MAX_ATTEMPTS = 3;

function readState(raw: unknown): SyncState | null {
  if (!raw || typeof raw !== 'object') return null;
  const file = raw as Partial<SyncFile>;
  if (file.format !== 'volako-sync' || !file.state) return null;
  const s = file.state as unknown as Record<string, unknown>;
  return {
    operations: normalizeOperations(s['operations']),
    deleted: normalizeDeletions(s['deleted']),
    budgets: normalizeBudgets(s['budgets']),
    references: normalizeReferences(s['references']),
    referenceTimes: normalizeReferenceTimes(s['referenceTimes']),
  };
}

/**
 * Synchronisation entre appareils par le fichier volako-donnees.json du Drive (script Google).
 * À l'ouverture, au retour du réseau et après chaque modification : lecture du fichier,
 * fusion avec les données de l'appareil, puis enregistrement du résultat (et d'une copie Volako.csv).
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly store = inject(BudgetStore);
  private readonly drive = inject(PhotoService);

  readonly syncing = signal(false);
  readonly error = signal('');
  /** Instant (ms) de la dernière synchro réussie */
  readonly lastSync = signal(Number(localStorage.getItem(LAST_SYNC_KEY)) || 0);

  /** État déjà identique à celui du Drive : inutile de renvoyer */
  private lastSynced = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private again = false;

  constructor() {
    // Chaque modification sur l'appareil part vers le Drive après un court délai
    effect(() => {
      const current = serializeState(this.store.syncState());
      untracked(() => {
        if (current !== this.lastSynced) this.schedule();
      });
    });
    window.addEventListener('online', () => void this.sync());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.sync();
    });
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), DEBOUNCE);
  }

  async sync(): Promise<void> {
    if (!this.drive.configured() || !navigator.onLine) return;
    if (this.syncing()) {
      this.again = true;
      return;
    }
    this.syncing.set(true);
    try {
      for (let attempt = 1; ; attempt++) {
        const pulled = await this.drive.call({ action: 'pull' });
        if (!pulled.ok) throw new Error(this.explain(pulled.error));

        const file = pulled.data ? (JSON.parse(pulled.data) as SyncFile) : null;
        const remote = readState(file);
        const local = this.store.syncState();
        const merged = remote ? mergeStates(local, remote) : local;
        const mergedText = serializeState(merged);

        if (mergedText !== serializeState(local)) {
          this.lastSynced = mergedText;
          this.store.applySynced(merged);
        }
        if (!remote || mergedText !== serializeState(remote)) {
          const savedAt = Date.now();
          const pushed = await this.drive.call({
            action: 'push',
            base: file?.savedAt ?? null,
            data: JSON.stringify({ format: 'volako-sync', version: 1, savedAt, state: merged } satisfies SyncFile),
            csv: exportCsv(merged),
          });
          if (!pushed.ok && pushed.conflict && attempt < MAX_ATTEMPTS) continue;
          if (!pushed.ok) throw new Error(this.explain(pushed.error));
        }
        this.lastSynced = mergedText;
        break;
      }
      this.error.set('');
      this.lastSync.set(Date.now());
      localStorage.setItem(LAST_SYNC_KEY, String(this.lastSync()));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.syncing.set(false);
      if (this.again) {
        this.again = false;
        void this.sync();
      }
    }
  }

  /** Un script d'avant la synchro ne connaît pas « pull » et répond par une erreur */
  private explain(error = ''): string {
    return error.includes('Clé') ? error : `Synchro refusée par le script (${error || 'erreur'}) : mets-le à jour`;
  }
}
