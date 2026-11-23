/*
 * Suivi de la moto : kilométrage et consommation.
 * Deux sources : les relevés saisis dans la page Moto et les dépenses de la catégorie Essence
 * (litres = montant ÷ prix du litre, avec le kilométrage et l'essence restante notés au moment du plein).
 *
 * Calcul : entre deux points où le kilométrage ET l'essence restante sont connus,
 *   essence consommée = restante au premier point + essence ajoutée entre les deux − restante au dernier point.
 * L'essence restante d'un point est celle d'avant l'ajout fait à ce point.
 */

import { FUEL_CATEGORY, MotoReading, Operation } from './models';
import { monthOf, round2 } from './utils';

export interface MotoEvent {
  /** Identifiant unique dans le journal ('r…' pour un relevé, 'o…' pour une dépense) */
  key: string;
  date: string;
  /** Ordre de saisie (l'identifiant est l'instant de création) */
  order: number;
  km: number | null;
  fuelLeft: number | null;
  /** Litres ajoutés à ce point */
  added: number;
  reading?: MotoReading;
  op?: Operation;
  /** Distance depuis le point précédent qui avait un kilométrage */
  distance: number | null;
  /** Consommation depuis le point complet précédent (km/L) */
  kmPerL: number | null;
}

export interface MotoStats {
  /** Moyenne sur tous les relevés (km/L), null s'il n'y a pas assez de points */
  kmPerL: number | null;
  /** Kilomètres parcourus pendant le mois donné */
  monthKm: number;
  /** Dernier kilométrage connu */
  lastKm: number | null;
}

/** Litres achetés avec une dépense Essence (au prix du jour de l'achat s'il est connu) */
export function litersOf(op: Operation, price: number): number {
  const p = op.fuelPrice ?? price;
  return p > 0 ? round2(op.amount / p) : 0;
}

/** Tous les points du suivi, du plus ancien au plus récent */
export function motoEvents(readings: readonly MotoReading[], operations: readonly Operation[], price: number): MotoEvent[] {
  const events: MotoEvent[] = [
    ...readings.map((r) => ({
      key: 'r' + r.id,
      date: r.date,
      order: r.id,
      km: r.km,
      fuelLeft: r.fuelLeft,
      added: r.added ?? 0,
      reading: r,
      distance: null,
      kmPerL: null,
    })),
    ...operations
      .filter((op) => op.kind === 'depense' && op.category === FUEL_CATEGORY)
      .map((op) => ({
        key: 'o' + op.id,
        date: op.date,
        order: op.id,
        km: op.odometer ?? null,
        fuelLeft: op.fuelLeft ?? null,
        added: litersOf(op, price),
        op,
        distance: null,
        kmPerL: null,
      })),
  ];
  events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);

  let lastKm: number | null = null;
  let lastFull: MotoEvent | null = null;
  let addedSince = 0;
  for (const e of events) {
    if (e.km !== null) {
      e.distance = lastKm === null ? null : round2(e.km - lastKm);
      lastKm = e.km;
    }
    if (e.km !== null && e.fuelLeft !== null) {
      if (lastFull) e.kmPerL = consumption(lastFull, e, addedSince);
      lastFull = e;
      addedSince = e.added;
    } else {
      addedSince += e.added;
    }
  }
  return events;
}

/** km/L entre deux points complets, null si le calcul n'a pas de sens (distance ou essence nulle) */
function consumption(from: MotoEvent, to: MotoEvent, added: number): number | null {
  const distance = to.km! - from.km!;
  const used = from.fuelLeft! + added - to.fuelLeft!;
  return distance > 0 && used > 0 ? distance / used : null;
}

export function motoStats(events: readonly MotoEvent[], month: string): MotoStats {
  const full = events.filter((e) => e.km !== null && e.fuelLeft !== null);
  let kmPerL: number | null = null;
  if (full.length >= 2) {
    const first = full[0];
    const last = full[full.length - 1];
    const from = events.indexOf(first);
    const to = events.indexOf(last);
    const added = events.slice(from, to).reduce((sum, e) => sum + e.added, 0);
    kmPerL = consumption(first, last, added);
  }

  const withKm = events.filter((e) => e.km !== null);
  const before = withKm.filter((e) => monthOf(e.date) < month).at(-1)?.km ?? null;
  const inMonth = withKm.filter((e) => monthOf(e.date) === month).map((e) => e.km!);
  const monthKm = inMonth.length ? Math.max(0, Math.max(...inMonth) - (before ?? Math.min(...inMonth))) : 0;

  return { kmPerL, monthKm: round2(monthKm), lastKm: withKm.at(-1)?.km ?? null };
}

/** Kilométrage le plus élevé noté avant cette date (pour repérer une faute de frappe) */
export function maxKmBefore(events: readonly MotoEvent[], date: string, exceptKey?: string): number | null {
  const kms = events.filter((e) => e.km !== null && e.date < date && e.key !== exceptKey).map((e) => e.km!);
  return kms.length ? Math.max(...kms) : null;
}
