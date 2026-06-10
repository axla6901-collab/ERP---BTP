import { describe, expect, it } from 'vitest';

import {
  bornesSemaine,
  calculerMarge,
  coutMainOeuvre,
  couleurBarre,
  estEnRetard,
  genererFrise,
  joursRestants,
  positionBarre,
  toneStatutChantier,
} from '@/lib/dashboard/compute';

describe('joursRestants', () => {
  it('compte les jours calendaires (positif si échéance future)', () => {
    expect(joursRestants('2024-01-10', '2024-01-01')).toBe(9);
  });
  it('négatif si l’échéance est passée', () => {
    expect(joursRestants('2024-01-01', '2024-01-10')).toBe(-9);
  });
  it('0 le jour même', () => {
    expect(joursRestants('2024-01-05', '2024-01-05')).toBe(0);
  });
  it('null si pas de date de fin', () => {
    expect(joursRestants(null, '2024-01-01')).toBeNull();
  });
});

describe('estEnRetard', () => {
  it('en cours + fin passée = en retard', () => {
    expect(estEnRetard('en_cours', '2024-01-01', '2024-01-10')).toBe(true);
  });
  it('terminé n’est jamais en retard', () => {
    expect(estEnRetard('termine', '2024-01-01', '2024-01-10')).toBe(false);
  });
  it('annulé n’est jamais en retard', () => {
    expect(estEnRetard('annule', '2024-01-01', '2024-01-10')).toBe(false);
  });
  it('échéance future = pas en retard', () => {
    expect(estEnRetard('en_cours', '2024-02-01', '2024-01-10')).toBe(false);
  });
  it('sans date de fin = pas en retard', () => {
    expect(estEnRetard('en_cours', null, '2024-01-10')).toBe(false);
  });
});

describe('coutMainOeuvre', () => {
  it('somme heures × taux', () => {
    expect(coutMainOeuvre([{ heures: 10, tauxHoraireBrut: 50 }])).toBe(500);
  });
  it('ignore les lignes sans taux connu', () => {
    expect(
      coutMainOeuvre([
        { heures: 10, tauxHoraireBrut: 50 },
        { heures: 5, tauxHoraireBrut: null },
      ]),
    ).toBe(500);
  });
  it('arrondit au centime', () => {
    expect(coutMainOeuvre([{ heures: 3, tauxHoraireBrut: 33.333 }])).toBe(100);
  });
  it('liste vide = 0', () => {
    expect(coutMainOeuvre([])).toBe(0);
  });
});

describe('calculerMarge', () => {
  it('marge = prévisionnel − coût MO + pourcentage', () => {
    const m = calculerMarge(10000, 3000);
    expect(m.marge).toBe(7000);
    expect(m.margePct).toBe(70);
    expect(m.coutMainOeuvre).toBe(3000);
  });
  it('marge négative possible', () => {
    const m = calculerMarge(1000, 1500);
    expect(m.marge).toBe(-500);
    expect(m.margePct).toBe(-50);
  });
  it('prévisionnel null → marge/pct null', () => {
    const m = calculerMarge(null, 3000);
    expect(m.montantPrevisionnel).toBeNull();
    expect(m.marge).toBeNull();
    expect(m.margePct).toBeNull();
    expect(m.coutMainOeuvre).toBe(3000);
  });
  it('prévisionnel 0 → pct null (pas de division par 0)', () => {
    const m = calculerMarge(0, 100);
    expect(m.marge).toBe(-100);
    expect(m.margePct).toBeNull();
  });
});

describe('bornesSemaine (lundi → dimanche)', () => {
  // 2024-01-01 est un lundi (référence connue).
  it('milieu de semaine', () => {
    expect(bornesSemaine('2024-01-03')).toEqual({ debut: '2024-01-01', fin: '2024-01-07' });
  });
  it('le lundi lui-même', () => {
    expect(bornesSemaine('2024-01-01')).toEqual({ debut: '2024-01-01', fin: '2024-01-07' });
  });
  it('le dimanche reste dans la même semaine', () => {
    expect(bornesSemaine('2024-01-07')).toEqual({ debut: '2024-01-01', fin: '2024-01-07' });
  });
});

describe('genererFrise', () => {
  it('3 mois (1 avant / 1 après) bornés aux 1er/dernier jours', () => {
    const f = genererFrise('2024-02-15', 1, 1);
    expect(f.debut).toBe('2024-01-01');
    expect(f.fin).toBe('2024-03-31');
    expect(f.mois).toHaveLength(3);
    expect(f.mois[0]?.label).toBe('Janvier 2024');
    expect(f.mois[2]?.label).toBe('Mars 2024');
    expect(f.mois[0]?.leftPct).toBe(0);
  });
  it('les segments couvrent ~100% sans chevauchement', () => {
    const f = genererFrise('2024-02-15', 1, 1);
    const total = f.mois.reduce((s, m) => s + m.widthPct, 0);
    expect(total).toBeCloseTo(100, 5);
    // chaque segment commence où le précédent finit
    const [m0, m1] = f.mois;
    expect(m1?.leftPct ?? 0).toBeCloseTo((m0?.leftPct ?? 0) + (m0?.widthPct ?? 0), 5);
  });
});

describe('positionBarre', () => {
  it('barre 1 jour en début de frise', () => {
    const p = positionBarre('2024-01-01', '2024-01-01', '2024-01-01', '2024-01-10');
    expect(p).not.toBeNull();
    expect(p?.leftPct).toBe(0);
    expect(p?.widthPct).toBeCloseTo(10, 5); // 1 jour sur 10
  });
  it('barre couvrant toute la frise', () => {
    const p = positionBarre('2024-01-01', '2024-01-10', '2024-01-01', '2024-01-10');
    expect(p?.leftPct).toBe(0);
    expect(p?.widthPct).toBeCloseTo(100, 5);
  });
  it('intervalle entièrement avant la frise → null', () => {
    expect(positionBarre('2023-12-01', '2023-12-31', '2024-01-01', '2024-01-10')).toBeNull();
  });
  it('sans dates → null', () => {
    expect(positionBarre(null, '2024-01-05', '2024-01-01', '2024-01-10')).toBeNull();
    expect(positionBarre('2024-01-05', null, '2024-01-01', '2024-01-10')).toBeNull();
  });
  it('largeur minimale garantie pour une barre minuscule', () => {
    const p = positionBarre('2024-06-15', '2024-06-15', '2024-01-01', '2024-12-31', 2);
    expect(p?.widthPct).toBeGreaterThanOrEqual(2);
  });
  it('clampe le début à 0 si la barre déborde avant la frise', () => {
    const p = positionBarre('2023-12-20', '2024-01-05', '2024-01-01', '2024-01-10');
    expect(p?.leftPct).toBe(0);
  });
});

describe('toneStatutChantier', () => {
  it('en cours = amber (maquette)', () => {
    expect(toneStatutChantier('en_cours')).toBe('amber');
  });
  it('terminé = emerald, annulé = rose, prospect = neutral, suspendu = orange', () => {
    expect(toneStatutChantier('termine')).toBe('emerald');
    expect(toneStatutChantier('annule')).toBe('rose');
    expect(toneStatutChantier('prospect')).toBe('neutral');
    expect(toneStatutChantier('suspendu')).toBe('orange');
  });
});

describe('couleurBarre', () => {
  it('le retard prime sur le statut (rose)', () => {
    expect(couleurBarre('en_cours', true)).toBe('rose');
    expect(couleurBarre('prospect', true)).toBe('rose');
  });
  it('couleur par statut hors retard', () => {
    expect(couleurBarre('en_cours', false)).toBe('amber');
    expect(couleurBarre('prospect', false)).toBe('sky');
    expect(couleurBarre('suspendu', false)).toBe('orange');
    expect(couleurBarre('termine', false)).toBe('emerald');
  });
});
