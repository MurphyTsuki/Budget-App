import { Injectable, computed, inject, signal } from '@angular/core';

import { BudgetStore } from './budget-store';
import { Operation } from './models';
import { pad2 } from './utils';

/** Adresse du script Google (déployé en application Web) et clé secrète partagée avec lui */
export interface DriveSettings {
  url: string;
  secret: string;
}

/** Photo compressée qui attend d'être envoyée dans Drive */
interface PendingPhoto {
  opId: number;
  blob: Blob;
  /** Nom personnalisé (facultatif), sinon l'heure de la saisie */
  customName: string;
}

/** Photo de Drive à mettre à la corbeille */
interface TrashItem {
  url: string;
  opId: number;
  /** Pas avant cet instant : on laisse le temps d'appuyer sur « Annuler » */
  after: number;
  /** Photo remplacée : à supprimer même si l'opération existe encore */
  replaced?: boolean;
}

const SETTINGS_KEY = 'driveSettings';
const TRASH_KEY = 'drivePendingTrash';
/** Un peu plus que la durée du message « Annuler » (5 s) */
const UNDO_DELAY = 6000;
/** Version du script Google attendue (constante VERSION de google-apps-script/Code.gs) */
const SCRIPT_VERSION = 2;

/** Plus grand côté de la photo après compression, en pixels */
const MAX_SIDE = 1280;
const JPEG_QUALITY = 0.8;

const DB_NAME = 'volako';
const STORE = 'pending-photos';

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
}

function loadSettings(): DriveSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (raw && typeof raw.secret === 'string' && raw.secret) {
      return { url: typeof raw.url === 'string' ? raw.url : '', secret: raw.secret };
    }
  } catch {
    // Réglages illisibles : on repart de zéro
  }
  const fresh = { url: '', secret: randomSecret() };
  saveSettings(fresh);
  return fresh;
}

function loadTrash(): TrashItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TRASH_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((t) => typeof t?.url === 'string' && typeof t?.opId === 'number') : [];
  } catch {
    return [];
  }
}

function saveTrash(items: TrashItem[]): void {
  try {
    localStorage.setItem(TRASH_KEY, JSON.stringify(items));
  } catch {
    // Stockage plein ou bloqué : la suppression sera perdue si l'appli est fermée avant l'envoi
  }
}

function saveSettings(settings: DriveSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Stockage plein ou bloqué : les réglages ne survivront pas au rechargement
  }
}

/* ---------- File d'attente (IndexedDB : les photos sont trop grosses pour le localStorage) ---------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'opId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/* ---------- Photo ---------- */

/** Réduit la photo (1280 px au plus, JPEG) : de quelques Mo à environ 150 Ko. */
async function compress(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Compression impossible'))), 'image/jpeg', JPEG_QUALITY),
  );
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** "2026-11-21_16-52.jpg", ou "2026-11-21_Plein-moto.jpg" avec un nom personnalisé */
function fileName(date: string, opId: number, customName: string): string {
  const custom = customName
    .trim()
    .replace(/\.(jpe?g|png)$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-');
  if (custom) return `${date}_${custom}.jpg`;
  const time = new Date(opId);
  return `${date}_${pad2(time.getHours())}-${pad2(time.getMinutes())}.jpg`;
}

/**
 * Envoi des photos de dépenses dans Google Drive, par le script de google-apps-script/Code.gs.
 * Les photos attendent sur le téléphone tant qu'il n'y a pas de réseau, puis seul le lien est gardé.
 */
@Injectable({ providedIn: 'root' })
export class PhotoService {
  private readonly store = inject(BudgetStore);

  readonly settings = signal<DriveSettings>(loadSettings());
  readonly configured = computed(() => this.settings().url.startsWith('https://'));

  /** Opérations dont la photo attend d'être envoyée */
  readonly pending = signal<ReadonlySet<number>>(new Set());
  readonly lastError = signal('');
  private sending = false;
  private trash = loadTrash();
  /** Photos de dépenses supprimées, qui attendent d'aller à la corbeille du Drive */
  readonly pendingTrash = signal(this.trash.length);

  constructor() {
    void this.refreshPending().then(() => this.flush());
    window.addEventListener('online', () => void this.flush());
  }

  setUrl(url: string): void {
    this.settings.update((s) => ({ ...s, url: url.trim() }));
    saveSettings(this.settings());
    void this.flush();
  }

  /** Vérifie que le script répond et accepte la clé secrète. Renvoie un message d'erreur, ou '' si tout va bien. */
  async test(url = this.settings().url): Promise<string> {
    try {
      const reply = await this.post(url, { ping: true });
      if (!reply.ok) return reply.error ?? 'Réponse inattendue du script';
      if ((reply.version ?? 1) < SCRIPT_VERSION) {
        return 'Le script répond, mais c’est une ancienne version : dans Google Apps Script, fais Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer';
      }
      return '';
    } catch {
      return 'Script injoignable : vérifie l’adresse et ta connexion';
    }
  }

  /** Compresse la photo, la met en attente puis tente de l'envoyer. */
  async attach(opId: number, file: Blob, customName = ''): Promise<void> {
    const blob = await compress(file);
    await withStore('readwrite', (s) => s.put({ opId, blob, customName } satisfies PendingPhoto));
    await this.refreshPending();
    void this.flush();
  }

  /**
   * Opérations supprimées : leurs photos iront à la corbeille du Drive après le délai « Annuler ».
   * Une opération restaurée entre-temps garde sa photo.
   */
  trashPhotosOf(removed: Operation[]): void {
    const after = Date.now() + UNDO_DELAY;
    const items = removed.filter((op) => op.photo).map((op) => ({ url: op.photo!, opId: op.id, after }));
    if (!items.length) return;
    this.trash = [...this.trash, ...items];
    saveTrash(this.trash);
    this.pendingTrash.set(this.trash.length);
    setTimeout(() => void this.flush(), UNDO_DELAY + 200);
  }

  /** Envoie les photos en attente et les suppressions, une par une. S'arrête à la première erreur (réessayé plus tard). */
  async flush(): Promise<void> {
    if (this.sending || !this.configured() || !navigator.onLine) return;
    this.sending = true;
    try {
      await this.flushTrash();
      const waiting = await withStore<PendingPhoto[]>('readonly', (s) => s.getAll());
      for (const photo of waiting) {
        const op = this.store.operations().find((o) => o.id === photo.opId);
        if (!op) {
          // Opération supprimée entre-temps : la photo n'a plus de raison d'être envoyée
          await withStore('readwrite', (s) => s.delete(photo.opId));
          continue;
        }
        const reply = await this.post(this.settings().url, {
          name: fileName(op.date, op.id, photo.customName),
          category: op.category ?? 'Hors budget',
          description: `${op.description} · ${op.amount} Ar`,
          mimeType: 'image/jpeg',
          data: await toBase64(photo.blob),
        });
        if (!reply.ok || !reply.url) throw new Error(reply.error ?? 'Envoi refusé');
        if (op.photo) {
          // Photo remplacée : l'ancienne part à la corbeille
          this.trash = [...this.trash, { url: op.photo, opId: op.id, after: 0, replaced: true }];
          saveTrash(this.trash);
          this.pendingTrash.set(this.trash.length);
        }
        this.store.update(op.id, { photo: reply.url });
        await withStore('readwrite', (s) => s.delete(photo.opId));
      }
      this.lastError.set('');
    } catch (err) {
      this.lastError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.sending = false;
      await this.refreshPending();
    }
  }

  private async flushTrash(): Promise<void> {
    const now = Date.now();
    for (const item of this.trash.filter((t) => t.after <= now)) {
      const restored = !item.replaced && this.store.operations().some((op) => op.id === item.opId);
      if (!restored) {
        const reply = await this.post(this.settings().url, { action: 'trash', url: item.url });
        // Un ancien script ne connaît pas « trash » : il répond par une erreur de décodage
        if (!reply.ok) throw new Error(`Suppression refusée (${reply.error ?? 'erreur'}) : mets à jour le script Google`);
      }
      this.trash = this.trash.filter((t) => t !== item);
      saveTrash(this.trash);
      this.pendingTrash.set(this.trash.length);
    }
  }

  private async refreshPending(): Promise<void> {
    try {
      const keys = await withStore<IDBValidKey[]>('readonly', (s) => s.getAllKeys());
      this.pending.set(new Set(keys.map(Number)));
    } catch {
      this.pending.set(new Set());
    }
  }

  /** Le corps part en texte brut : un envoi JSON déclencherait une vérification que le script Google refuse. */
  private async post(url: string, body: object): Promise<{ ok: boolean; url?: string; error?: string; version?: number }> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, secret: this.settings().secret }),
    });
    return response.json();
  }
}
