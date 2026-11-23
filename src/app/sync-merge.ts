/*
 * Fusion de deux états de Volako (celui de l'appareil et celui du fichier de synchro dans Drive).
 * Règles :
 * - une opération est reconnue par son identifiant ; la version modifiée le plus récemment l'emporte ;
 * - une opération supprimée après sa dernière modification reste supprimée, partout ;
 * - pour un budget, celui qui a utilisé le plus de modifications l'emporte (la limite de 3 tient
 *   d'un appareil à l'autre), puis le plus récent ;
 * - pour un solde de référence, le plus récemment modifié l'emporte (même s'il a été retiré) ;
 * - les relevés moto suivent les mêmes règles que les opérations ; le prix du litre le plus récent l'emporte.
 */

import type { SyncState } from './budget-store';
import { Deletions, MonthBudget, MotoReading, Operation } from './models';

/** Réunit deux listes reconnues par leur identifiant : la plus récente l'emporte, les suppressions aussi */
function mergeById<T extends { id: number; updatedAt?: number }>(
  local: readonly T[],
  remote: readonly T[],
  localDeleted: Deletions,
  remoteDeleted: Deletions,
): { items: T[]; deleted: Deletions } {
  const deleted = { ...remoteDeleted };
  for (const [id, at] of Object.entries(localDeleted)) deleted[id] = Math.max(at, deleted[id] ?? 0);

  const byId = new Map<number, T>();
  for (const item of [...remote, ...local]) {
    const known = byId.get(item.id);
    if (!known || (item.updatedAt ?? 0) >= (known.updatedAt ?? 0)) byId.set(item.id, item);
  }
  const items = [...byId.values()].filter((item) => !(item.id in deleted) || deleted[item.id] < (item.updatedAt ?? 0));
  return { items, deleted };
}

export function mergeStates(local: SyncState, remote: SyncState): SyncState {
  const merged = mergeById<Operation>(local.operations, remote.operations, local.deleted, remote.deleted);
  const deleted = merged.deleted;
  let operations = merged.items;
  // Des frais sans leur opération n'ont plus de sens
  const ids = new Set(operations.map((op) => op.id));
  operations = operations.filter((op) => op.parentId === null || ids.has(op.parentId)).sort((a, b) => a.id - b.id);

  const budgets: Record<string, MonthBudget> = { ...remote.budgets };
  for (const [month, mine] of Object.entries(local.budgets)) {
    const theirs = budgets[month];
    const mineWins =
      !theirs || mine.edits > theirs.edits || (mine.edits === theirs.edits && (mine.updatedAt ?? 0) >= (theirs.updatedAt ?? 0));
    if (mineWins) budgets[month] = mine;
  }

  const references = { ...remote.references };
  const referenceTimes = { ...remote.referenceTimes };
  for (const key of ['banque', 'mvola'] as const) {
    if (local.referenceTimes[key] >= remote.referenceTimes[key]) {
      references[key] = local.references[key];
      referenceTimes[key] = local.referenceTimes[key];
    }
  }

  // Catégories créées : réunies par nom (elles ne se suppriment pas)
  const categories = [...remote.categories];
  for (const c of local.categories) {
    if (!categories.some((r) => r.name.toLowerCase() === c.name.toLowerCase())) categories.push(c);
  }

  const moto = mergeById<MotoReading>(local.moto, remote.moto, local.motoDeleted, remote.motoDeleted);
  const fuelPrice = local.fuelPrice.updatedAt >= remote.fuelPrice.updatedAt ? local.fuelPrice : remote.fuelPrice;

  return {
    operations,
    deleted,
    budgets,
    references,
    referenceTimes,
    categories,
    moto: moto.items.sort((a, b) => a.id - b.id),
    motoDeleted: moto.deleted,
    fuelPrice,
  };
}

/** Texte stable d'un état (mêmes données → même texte), pour savoir s'il a changé */
export function serializeState(state: SyncState): string {
  const sortKeys = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  // Les champs de chaque opération sont triés : selon sa provenance, leur ordre varie
  return JSON.stringify({
    operations: [...state.operations]
      .sort((a, b) => a.id - b.id)
      .map((op) => sortKeys(op as unknown as Record<string, unknown>)),
    deleted: sortKeys(state.deleted),
    budgets: sortKeys(
      Object.fromEntries(Object.entries(state.budgets).map(([m, b]) => [m, sortKeys(b as unknown as Record<string, unknown>)])),
    ),
    references: state.references,
    referenceTimes: state.referenceTimes,
    categories: state.categories,
    moto: [...state.moto]
      .sort((a, b) => a.id - b.id)
      .map((r) => sortKeys(r as unknown as Record<string, unknown>)),
    motoDeleted: sortKeys(state.motoDeleted),
    fuelPrice: state.fuelPrice,
  });
}
