import { describe, expect, it } from 'vitest';

import {
  bornesMois,
  comparerMois,
  dateDansMois,
  joursDansMois,
  lendemainFinMois,
  libellePeriode,
  moisDeLaDate,
  moisDepuisParametre,
  parametreMois,
  periodeModifiable,
  periodePrecedente,
  periodeSuivante,
  proposerNouvellePeriode,
  transitionsPeriode,
  verifierTransitionPeriode,
} from '@/lib/test-sirh/paie/periodes';

const AUJOURDHUI = '2026-10-19';

describe('arithmétique des mois de paie', () => {
  it('passe au mois suivant / précédent en franchissant l’année', () => {
    expect(periodeSuivante({ annee: 2026, mois: 10 })).toEqual({ annee: 2026, mois: 11 });
    expect(periodeSuivante({ annee: 2026, mois: 12 })).toEqual({ annee: 2027, mois: 1 });
    expect(periodePrecedente({ annee: 2026, mois: 1 })).toEqual({ annee: 2025, mois: 12 });
    expect(periodePrecedente({ annee: 2026, mois: 7 })).toEqual({ annee: 2026, mois: 6 });
  });

  it('compare chronologiquement', () => {
    expect(comparerMois({ annee: 2026, mois: 1 }, { annee: 2025, mois: 12 })).toBeGreaterThan(0);
    expect(comparerMois({ annee: 2026, mois: 3 }, { annee: 2026, mois: 4 })).toBeLessThan(0);
    expect(comparerMois({ annee: 2026, mois: 3 }, { annee: 2026, mois: 3 })).toBe(0);
  });

  it('donne les bornes du mois (années bissextiles comprises)', () => {
    expect(bornesMois({ annee: 2026, mois: 2 })).toEqual({
      debut: '2026-02-01',
      fin: '2026-02-28',
    });
    expect(bornesMois({ annee: 2028, mois: 2 }).fin).toBe('2028-02-29');
    expect(joursDansMois({ annee: 2026, mois: 10 })).toBe(31);
    expect(lendemainFinMois({ annee: 2026, mois: 12 })).toBe('2027-01-01');
    expect(dateDansMois('2026-10-31', { annee: 2026, mois: 10 })).toBe(true);
    expect(dateDansMois('2026-11-01', { annee: 2026, mois: 10 })).toBe(false);
  });

  it('lit et écrit le paramètre d’URL ?mois=', () => {
    expect(parametreMois({ annee: 2026, mois: 3 })).toBe('2026-03');
    expect(moisDepuisParametre('2026-03', AUJOURDHUI)).toEqual({ annee: 2026, mois: 3 });
    expect(moisDepuisParametre('2026-13', AUJOURDHUI)).toEqual({ annee: 2026, mois: 10 });
    expect(moisDepuisParametre('abc', AUJOURDHUI)).toEqual({ annee: 2026, mois: 10 });
    expect(moisDepuisParametre(undefined, AUJOURDHUI)).toEqual({ annee: 2026, mois: 10 });
    expect(moisDeLaDate('2027-01-15')).toEqual({ annee: 2027, mois: 1 });
  });

  it('formate le libellé de période avec une majuscule', () => {
    expect(libellePeriode({ annee: 2026, mois: 10 })).toBe('Octobre 2026');
    expect(libellePeriode({ annee: 2027, mois: 8 })).toBe('Août 2027');
  });

  it('propose le mois courant, sinon le premier mois suivant non créé', () => {
    expect(proposerNouvellePeriode([], AUJOURDHUI)).toEqual({ annee: 2026, mois: 10 });
    expect(proposerNouvellePeriode([{ annee: 2026, mois: 9 }], AUJOURDHUI)).toEqual({
      annee: 2026,
      mois: 10,
    });
    expect(
      proposerNouvellePeriode(
        [
          { annee: 2026, mois: 10 },
          { annee: 2026, mois: 11 },
          { annee: 2026, mois: 12 },
        ],
        AUJOURDHUI,
      ),
    ).toEqual({ annee: 2027, mois: 1 });
  });
});

describe('cycle de vie d’une période', () => {
  it('liste les transitions proposées selon le statut et le rôle', () => {
    expect(transitionsPeriode('ouverte', { peutGerer: false }).map((t) => t.vers)).toEqual([
      'en_controle',
    ]);
    expect(transitionsPeriode('en_controle', { peutGerer: false }).map((t) => t.vers)).toEqual([
      'ouverte',
      'cloturee',
    ]);
    expect(transitionsPeriode('cloturee', { peutGerer: false })).toEqual([]);
    const reouverture = transitionsPeriode('cloturee', { peutGerer: true });
    expect(reouverture).toHaveLength(1);
    expect(reouverture[0]).toMatchObject({
      vers: 'ouverte',
      libelle: 'Rouvrir la période',
      reserveeGestion: true,
    });
    expect(transitionsPeriode('en_controle', { peutGerer: true })[1]?.libelle).toBe(
      'Clôturer la période',
    );
  });

  it('vérifie chaque transition', () => {
    expect(verifierTransitionPeriode('ouverte', 'en_controle', { peutGerer: false })).toBeNull();
    expect(verifierTransitionPeriode('en_controle', 'cloturee', { peutGerer: false })).toBeNull();
    expect(verifierTransitionPeriode('en_controle', 'ouverte', { peutGerer: false })).toBeNull();
    expect(verifierTransitionPeriode('cloturee', 'ouverte', { peutGerer: true })).toBeNull();
    expect(verifierTransitionPeriode('cloturee', 'ouverte', { peutGerer: false })).toMatch(
      /gestionnaires RH/,
    );
    expect(verifierTransitionPeriode('ouverte', 'cloturee', { peutGerer: true })).toMatch(
      /contrôle/,
    );
    expect(verifierTransitionPeriode('cloturee', 'en_controle', { peutGerer: true })).toMatch(
      /non autorisé/,
    );
    expect(verifierTransitionPeriode('ouverte', 'ouverte', { peutGerer: true })).toMatch(/déjà/);
  });

  it('une période clôturée est en lecture seule', () => {
    expect(periodeModifiable('ouverte')).toBe(true);
    expect(periodeModifiable('en_controle')).toBe(true);
    expect(periodeModifiable('cloturee')).toBe(false);
  });
});
