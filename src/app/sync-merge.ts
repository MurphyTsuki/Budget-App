/*
 * Fusion de deux états de Volako (celui de l'appareil et celui du fichier de synchro dans Drive).
 * Règles :
 * - une opération est reconnue par son identifiant ; la version modifiée le plus récemment l'emporte ;
 * - une opération supprimée après sa dernière modification reste supprimée, partout ;
 * - pour un budget, celui qui a utilisé le plus de modifications l'emporte (la limite de 3 tient
 *   d'un appareil à l'autre), puis le plus récent ;
 * - pour un solde de référence, le plus récemment modifié l'emporte (même s'il a été retiré).
 */

import type { SyncState } from './budget-store';
import { MonthBudget, Operation } from './models';

export function mergeStates(local: SyncState, remote: SyncState): SyncState {
  const deleted = { ...remote.deleted };
  for (const [id, at] of Object.entries(local.deleted)) deleted[id] = Math.max(at, deleted[id] ?? 0);

  const byId = new Map<number, Operation>();
  for (const op of [...remote.operations, ...local.operations]) {
    const known = byId.get(op.id);
    if (!known || (op.updatedAt ?? 0) >= (known.updatedAt ?? 0)) byId.set(op.id, op);
  }
  let operations = [...byId.values()].filter((op) => !(op.id in deleted) || deleted[op.id] < (op.updatedAt ?? 0));
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

  return { operations, deleted, budgets, references, referenceTimes, categories };
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
  });
}
