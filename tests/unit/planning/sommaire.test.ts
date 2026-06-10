import { describe, expect, it } from 'vitest';

import { agregerSommaireChantiers, type TacheAgregable } from '@/lib/planning/sommaire';

function t(p: Partial<TacheAgregable>): TacheAgregable {
  return {
    chantierId: p.chantierId ?? 'c1',
    avancementPourcent: p.avancementPourcent ?? 0,
    heuresPlanifiees: p.heuresPlanifiees ?? 0,
    dateDebutPrevue: p.dateDebutPrevue ?? null,
    dateFinPrevue: p.dateFinPrevue ?? null,
  };
}

describe('agregerSommaireChantiers', () => {
  it('avancement pondéré par heures planifiées (∑(av×h)/∑h, arrondi)', () => {
    const m = agregerSommaireChantiers([
      t({ chantierId: 'c1', avancementPourcent: 100, heuresPlanifiees: 30 }),
      t({ chantierId: 'c1', avancementPourcent: 0, heuresPlanifiees: 10 }),
    ]);
    // (100*30 + 0*10) / 40 = 75
    expect(m.get('c1')?.avancementPourcent).toBe(75);
    expect(m.get('c1')?.nbTaches).toBe(2);
  });

  it('fallback sur la moyenne arithmétique quand toutes les heures = 0', () => {
    const m = agregerSommaireChantiers([
      t({ chantierId: 'c1', avancementPourcent: 40, heuresPlanifiees: 0 }),
      t({ chantierId: 'c1', avancementPourcent: 60, heuresPlanifiees: 0 }),
    ]);
    expect(m.get('c1')?.avancementPourcent).toBe(50);
  });

  it('plage de dates = min(début) / max(fin) en ignorant les nulls', () => {
    const m = agregerSommaireChantiers([
      t({ chantierId: 'c1', dateDebutPrevue: '2026-05-10', dateFinPrevue: '2026-05-20' }),
      t({ chantierId: 'c1', dateDebutPrevue: '2026-05-02', dateFinPrevue: '2026-05-12' }),
      t({ chantierId: 'c1', dateDebutPrevue: null, dateFinPrevue: '2026-06-01' }),
    ]);
    const s = m.get('c1');
    expect(s?.dateMinTaches).toBe('2026-05-02');
    expect(s?.dateMaxTaches).toBe('2026-06-01');
  });

  it('aucune tâche datée → dateMin/dateMax null', () => {
    const m = agregerSommaireChantiers([
      t({ chantierId: 'c1', avancementPourcent: 50, heuresPlanifiees: 5 }),
    ]);
    const s = m.get('c1');
    expect(s?.dateMinTaches).toBeNull();
    expect(s?.dateMaxTaches).toBeNull();
  });

  it('isole les chantiers les uns des autres', () => {
    const m = agregerSommaireChantiers([
      t({ chantierId: 'c1', avancementPourcent: 100, heuresPlanifiees: 1 }),
      t({ chantierId: 'c2', avancementPourcent: 20, heuresPlanifiees: 1 }),
      t({ chantierId: 'c2', avancementPourcent: 40, heuresPlanifiees: 1 }),
    ]);
    expect(m.size).toBe(2);
    expect(m.get('c1')?.nbTaches).toBe(1);
    expect(m.get('c1')?.avancementPourcent).toBe(100);
    expect(m.get('c2')?.nbTaches).toBe(2);
    expect(m.get('c2')?.avancementPourcent).toBe(30);
  });

  it('liste vide → Map vide', () => {
    expect(agregerSommaireChantiers([]).size).toBe(0);
  });
});
