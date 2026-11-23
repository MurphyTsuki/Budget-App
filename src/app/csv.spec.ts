import { exportCsv, parseCsv } from './csv';

describe('CSV', () => {
  it('garde les relevés moto, le prix du litre et le compteur des pleins', () => {
    const csv = exportCsv({
      operations: [
        {
          id: 1795400000000,
          date: '2026-11-22',
          kind: 'depense',
          account: 'cash',
          amount: 10600,
          description: 'Plein',
          category: 'Essence',
          channel: 'especes',
          parentId: null,
          odometer: 12040,
          fuelLeft: 0.5,
          fuelPrice: 5300,
        },
      ],
      references: { banque: null, mvola: null },
      budgets: {},
      moto: [{ id: 1795300000000, date: '2026-11-21', km: 12000, fuelLeft: 1, added: null }],
      fuelPrice: { price: 5500, updatedAt: 1 },
    });
    expect(csv).toContain('Essence ajoutée (L)');
    expect(csv).toContain(';12040;0,5;2;5300');

    const parsed = parseCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.fuelPrice?.price).toBe(5500);
    expect(parsed.moto).toEqual([{ id: 1795300000000, date: '2026-11-21', km: 12000, fuelLeft: 1, added: null }]);
    expect(parsed.operations[0]).toMatchObject({ odometer: 12040, fuelLeft: 0.5, fuelPrice: 5300 });
  });
});
