import { MotoReading, Operation } from './models';
import { litersOf, maxKmBefore, motoEvents, motoStats } from './moto';

const reading = (id: number, date: string, km: number | null, fuelLeft: number | null, added: number | null = null): MotoReading => ({
  id,
  date,
  km,
  fuelLeft,
  added,
});

const fuel = (id: number, date: string, amount: number, extra: Partial<Operation> = {}): Operation => ({
  id,
  date,
  kind: 'depense',
  account: 'cash',
  amount,
  description: 'Essence',
  category: 'Essence',
  channel: 'especes',
  parentId: null,
  ...extra,
});

describe('suivi moto', () => {
  it('calcule les litres au prix du jour de l’achat', () => {
    expect(litersOf(fuel(1, '2026-11-20', 10600), 5300)).toBe(2);
    expect(litersOf(fuel(1, '2026-11-20', 11000, { fuelPrice: 5500 }), 5300)).toBe(2);
  });

  it('moyenne : essence restante + ajouts − essence restante à la fin', () => {
    // 1 L restant, +2 L achetés (10 600 Ar), 1,5 L restant après 100 km : 1,5 L consommés
    const events = motoEvents(
      [reading(1, '2026-11-20', 1000, 1), reading(3, '2026-11-22', 1100, 1.5)],
      [fuel(2, '2026-11-21', 10600)],
      5300,
    );
    const stats = motoStats(events, '2026-11');
    expect(stats.kmPerL).toBeCloseTo(100 / 1.5);
    expect(stats.monthKm).toBe(100);
    expect(stats.lastKm).toBe(1100);
    expect(events[2].distance).toBe(100);
    expect(events[2].kmPerL).toBeCloseTo(100 / 1.5);
  });

  it('le plein noté avec le compteur compte comme un point complet', () => {
    // Au plein : 0,5 L restait au compteur 1050 ; 2 L ajoutés ; au relevé suivant 1,5 L à 1100
    const events = motoEvents(
      [reading(1, '2026-11-20', 1000, 1), reading(3, '2026-11-22', 1100, 1.5)],
      [fuel(2, '2026-11-21', 10600, { odometer: 1050, fuelLeft: 0.5 })],
      5300,
    );
    expect(events[1].kmPerL).toBeCloseTo(50 / 0.5);
    expect(events[2].kmPerL).toBeCloseTo(50 / 1);
    expect(motoStats(events, '2026-11').kmPerL).toBeCloseTo(100 / 1.5);
  });

  it('pas de moyenne avec un seul point complet', () => {
    const events = motoEvents([reading(1, '2026-11-20', 1000, 1), reading(2, '2026-11-21', 1100, null)], [], 5300);
    expect(motoStats(events, '2026-11').kmPerL).toBeNull();
  });

  it('les km du mois partent du dernier relevé du mois précédent', () => {
    const events = motoEvents([reading(1, '2026-11-28', 1000, null), reading(2, '2026-12-03', 1080, null)], [], 5300);
    expect(motoStats(events, '2026-12').monthKm).toBe(80);
  });

  it('repère un kilométrage plus petit qu’un relevé plus ancien', () => {
    const events = motoEvents([reading(1, '2026-11-20', 1000, 1)], [], 5300);
    expect(maxKmBefore(events, '2026-11-21')).toBe(1000);
    expect(maxKmBefore(events, '2026-11-20')).toBeNull();
  });

  it('ignore les dépenses des autres catégories', () => {
    const events = motoEvents([], [fuel(1, '2026-11-20', 5000, { category: 'Tennis' })], 5300);
    expect(events).toEqual([]);
  });
});
