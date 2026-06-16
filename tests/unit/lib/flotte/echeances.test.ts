import { describe, expect, it } from 'vitest';

import {
  controlePermisConducteur,
  estEnAlerte,
  joursAvantEcheance,
  niveauUrgenceEcheance,
  statutEcheance,
} from '@/lib/flotte/echeances';

const TODAY = '2026-06-16';

describe('joursAvantEcheance', () => {
  it('compte les jours (négatif si dépassée)', () => {
    expect(joursAvantEcheance('2026-06-16', TODAY)).toBe(0);
    expect(joursAvantEcheance('2026-06-17', TODAY)).toBe(1);
    expect(joursAvantEcheance('2026-06-13', TODAY)).toBe(-3);
    expect(joursAvantEcheance('2026-07-16', TODAY)).toBe(30);
  });
});

describe('statutEcheance', () => {
  it('expire si la date est passée', () => {
    expect(statutEcheance('2026-06-13', 30, TODAY)).toBe('expire');
    expect(statutEcheance('2026-06-15', 30, TODAY)).toBe('expire');
  });

  it('à renouveler dans le seuil (bornes incluses J-0 et J-seuil)', () => {
    expect(statutEcheance('2026-06-16', 30, TODAY)).toBe('a_renouveler'); // J-0
    expect(statutEcheance('2026-07-04', 30, TODAY)).toBe('a_renouveler'); // J-18
    expect(statutEcheance('2026-07-16', 30, TODAY)).toBe('a_renouveler'); // J-30 (borne)
  });

  it('à jour au-delà du seuil', () => {
    expect(statutEcheance('2026-07-17', 30, TODAY)).toBe('a_jour'); // J-31
    expect(statutEcheance('2026-08-20', 30, TODAY)).toBe('a_jour');
  });

  it('respecte un seuil personnalisé', () => {
    expect(statutEcheance('2026-06-22', 7, TODAY)).toBe('a_renouveler'); // J-6 ≤ 7
    expect(statutEcheance('2026-06-24', 7, TODAY)).toBe('a_jour'); // J-8 > 7
  });
});

describe('niveauUrgenceEcheance', () => {
  it('critique si dépassée ou ≤ 7 jours', () => {
    expect(niveauUrgenceEcheance('2026-06-13', 30, TODAY)).toBe('critique');
    expect(niveauUrgenceEcheance('2026-06-16', 30, TODAY)).toBe('critique'); // 0 j
    expect(niveauUrgenceEcheance('2026-06-23', 30, TODAY)).toBe('critique'); // 7 j
  });

  it('proche entre 8 jours et le seuil', () => {
    expect(niveauUrgenceEcheance('2026-06-24', 30, TODAY)).toBe('proche'); // 8 j
    expect(niveauUrgenceEcheance('2026-07-16', 30, TODAY)).toBe('proche'); // 30 j
  });

  it('ok au-delà du seuil', () => {
    expect(niveauUrgenceEcheance('2026-08-20', 30, TODAY)).toBe('ok');
  });
});

describe('estEnAlerte', () => {
  it('vrai si dépassée ou à renouveler', () => {
    expect(estEnAlerte('2026-06-13', 30, TODAY)).toBe(true);
    expect(estEnAlerte('2026-07-04', 30, TODAY)).toBe(true);
    expect(estEnAlerte('2026-08-20', 30, TODAY)).toBe(false);
  });
});

describe('controlePermisConducteur', () => {
  it('valide si le conducteur détient une catégorie couvrante non expirée', () => {
    const r = controlePermisConducteur(
      'vl',
      [{ categorie: 'B', dateValidite: '2028-09-01' }],
      TODAY,
    );
    expect(r).toEqual({ requis: true, detientCategorie: true, valide: true, message: null });
  });

  it('couvre un PL avec C1 ou C, validité illimitée (null)', () => {
    const r = controlePermisConducteur('pl', [{ categorie: 'C', dateValidite: null }], TODAY);
    expect(r.valide).toBe(true);
    expect(r.message).toBeNull();
  });

  it('avertit si la catégorie requise est absente', () => {
    const r = controlePermisConducteur(
      'pl',
      [{ categorie: 'B', dateValidite: '2030-01-01' }],
      TODAY,
    );
    expect(r.detientCategorie).toBe(false);
    expect(r.valide).toBe(false);
    expect(r.message).toContain('C');
  });

  it('avertit si le permis couvrant est expiré', () => {
    const r = controlePermisConducteur(
      'vl',
      [{ categorie: 'B', dateValidite: '2020-01-01' }],
      TODAY,
    );
    expect(r.detientCategorie).toBe(true);
    expect(r.valide).toBe(false);
    expect(r.message).toContain('expiré');
  });

  it("n'exige aucun permis routier pour un engin de chantier", () => {
    const r = controlePermisConducteur('engin', [], TODAY);
    expect(r).toEqual({ requis: false, detientCategorie: true, valide: true, message: null });
  });
});
