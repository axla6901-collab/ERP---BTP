import { describe, expect, it } from 'vitest';

import {
  objectifEnRetard,
  progressionCampagne,
  progressionObjectifs,
} from '@/lib/test-sirh/entretiens/progression';

describe('progressionCampagne', () => {
  it('compte réalisés + signés sur les entretiens non annulés', () => {
    expect(
      progressionCampagne(['a_planifier', 'planifie', 'realise', 'signe', 'annule', 'signe']),
    ).toEqual({ total: 5, realises: 3, annules: 1, pourcentage: 60 });
  });

  it('vaut 0 % sans entretien', () => {
    expect(progressionCampagne([])).toEqual({
      total: 0,
      realises: 0,
      annules: 0,
      pourcentage: 0,
    });
    expect(progressionCampagne(['annule']).pourcentage).toBe(0);
  });
});

describe('progressionObjectifs', () => {
  it('pondère par le poids et ignore les objectifs abandonnés', () => {
    expect(
      progressionObjectifs([
        { poids: 60, progression: 100, statut: 'atteint' },
        { poids: 40, progression: 50, statut: 'en_cours' },
        { poids: 100, progression: 0, statut: 'abandonne' },
      ]),
    ).toBe(80);
  });

  it('poids absent = 1 ; tous les poids nuls → moyenne simple', () => {
    expect(
      progressionObjectifs([
        { poids: null, progression: 20, statut: 'en_cours' },
        { poids: null, progression: 70, statut: 'en_cours' },
      ]),
    ).toBe(45);
    expect(
      progressionObjectifs([
        { poids: 0, progression: 30, statut: 'en_cours' },
        { poids: 0, progression: 90, statut: 'en_cours' },
      ]),
    ).toBe(60);
  });

  it('null sans objectif retenu ; progressions bornées à 0–100', () => {
    expect(progressionObjectifs([])).toBeNull();
    expect(progressionObjectifs([{ poids: 1, progression: 150, statut: 'atteint' }])).toBe(100);
  });
});

describe('objectifEnRetard', () => {
  it('objectif en cours dont l’échéance est passée', () => {
    expect(objectifEnRetard({ statut: 'en_cours', dateEcheance: '2026-10-18' }, '2026-10-19')).toBe(
      true,
    );
    expect(objectifEnRetard({ statut: 'en_cours', dateEcheance: '2026-10-19' }, '2026-10-19')).toBe(
      false,
    );
    expect(objectifEnRetard({ statut: 'atteint', dateEcheance: '2026-01-01' }, '2026-10-19')).toBe(
      false,
    );
    expect(objectifEnRetard({ statut: 'en_cours', dateEcheance: null }, '2026-10-19')).toBe(false);
  });
});
