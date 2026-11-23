import type { SyncState } from './budget-store';
import { Operation } from './models';
import { mergeStates } from './sync-merge';

const op = (id: number, updatedAt: number, amount = 1000, parentId: number | null = null): Operation => ({
  id,
  date: '2026-11-22',
  kind: 'depense',
  account: 'cash',
  amount,
  description: `op ${id}`,
  category: 'Essence',
  channel: parentId ? 'frais' : 'especes',
  parentId,
  updatedAt,
});

const state = (partial: Partial<SyncState>): SyncState => ({
  operations: [],
  deleted: {},
  budgets: {},
  references: { banque: null, mvola: null },
  referenceTimes: { banque: 0, mvola: 0 },
  categories: [],
  ...partial,
});

describe('mergeStates', () => {
  it('réunit les opérations des deux appareils sans doublon', () => {
    const merged = mergeStates(state({ operations: [op(1, 10), op(2, 10)] }), state({ operations: [op(2, 10), op(3, 10)] }));
    expect(merged.operations.map((o) => o.id)).toEqual([1, 2, 3]);
  });

  it('garde la modification la plus récente', () => {
    const merged = mergeStates(state({ operations: [op(1, 10, 500)] }), state({ operations: [op(1, 20, 900)] }));
    expect(merged.operations[0].amount).toBe(900);
  });

  it('une suppression sur un appareil supprime partout', () => {
    const merged = mergeStates(state({ deleted: { 1: 30 } }), state({ operations: [op(1, 10)] }));
    expect(merged.operations).toEqual([]);
    expect(merged.deleted['1']).toBe(30);
  });

  it('une opération restaurée après sa suppression revient', () => {
    const merged = mergeStates(state({ operations: [op(1, 40)] }), state({ deleted: { 1: 30 } }));
    expect(merged.operations.map((o) => o.id)).toEqual([1]);
  });

  it('les frais disparaissent avec leur opération', () => {
    const merged = mergeStates(state({ deleted: { 1: 30 } }), state({ operations: [op(1, 10), op(2, 10, 700, 1)] }));
    expect(merged.operations).toEqual([]);
  });

  it('le budget qui a utilisé le plus de modifications l’emporte', () => {
    const merged = mergeStates(
      state({ budgets: { '2026-11': { amounts: { Essence: 50000 }, edits: 0, updatedAt: 99 } } }),
      state({ budgets: { '2026-11': { amounts: { Essence: 40000 }, edits: 2, updatedAt: 10 } } }),
    );
    expect(merged.budgets['2026-11'].amounts['Essence']).toBe(40000);
  });

  it('le solde de référence le plus récent l’emporte, même retiré', () => {
    const merged = mergeStates(
      state({ references: { banque: null, mvola: null }, referenceTimes: { banque: 50, mvola: 0 } }),
      state({ references: { banque: { date: '2026-11-01', amount: 1 }, mvola: null }, referenceTimes: { banque: 20, mvola: 0 } }),
    );
    expect(merged.references.banque).toBeNull();
  });

  it('réunit les catégories créées sur chaque appareil', () => {
    const merged = mergeStates(
      state({ categories: [{ name: 'Cadeaux', icon: 'gem', color: '#f08fa8' }] }),
      state({ categories: [{ name: 'Santé', icon: 'heart', color: '#9fd9c0' }, { name: 'cadeaux', icon: 'tag', color: '#7fb8f0' }] }),
    );
    expect(merged.categories.map((c) => c.name)).toEqual(['Santé', 'cadeaux']);
  });
});
