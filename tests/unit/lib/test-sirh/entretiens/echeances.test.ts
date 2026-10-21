import { describe, expect, it } from 'vitest';

import {
  calculerSuiviEntretienPro,
  echeanceBilanSixAns,
  estEntretienProfessionnel,
  estEntretienRealise,
  prochainEntretienProfessionnel,
  statutEcheance,
  type EntretienPourSuivi,
} from '@/lib/test-sirh/entretiens/echeances';

const TODAY = '2026-10-19';

function entretien(p: Partial<EntretienPourSuivi> & { id: string }): EntretienPourSuivi {
  return {
    typeEntretien: 'professionnel',
    statut: 'realise',
    datePrevue: null,
    dateRealisation: null,
    ...p,
  };
}

describe('prochainEntretienProfessionnel', () => {
  it('ajoute 24 mois au dernier entretien, sinon à la date d’entrée', () => {
    expect(prochainEntretienProfessionnel('2025-03-15', '2010-01-01')).toBe('2027-03-15');
    expect(prochainEntretienProfessionnel(null, '2025-09-01')).toBe('2027-09-01');
    expect(prochainEntretienProfessionnel(null, null)).toBeNull();
  });

  it('borne le jour au dernier jour du mois cible', () => {
    expect(prochainEntretienProfessionnel('2026-02-28', null)).toBe('2028-02-28');
    expect(prochainEntretienProfessionnel(null, '2024-02-29')).toBe('2026-02-28');
  });
});

describe('echeanceBilanSixAns', () => {
  it('première échéance = entrée + 6 ans sans bilan', () => {
    expect(echeanceBilanSixAns('2015-01-01', null)).toBe('2021-01-01');
  });

  it('un bilan tenu un peu avant ou après l’échéance la couvre', () => {
    expect(echeanceBilanSixAns('2015-01-01', '2020-10-01')).toBe('2027-01-01');
    expect(echeanceBilanSixAns('2015-01-01', '2021-03-01')).toBe('2027-01-01');
  });

  it('un bilan trop précoce ne couvre pas l’échéance', () => {
    expect(echeanceBilanSixAns('2015-01-01', '2018-06-01')).toBe('2021-01-01');
  });

  it('sans date d’entrée : dernier bilan + 6 ans, sinon inconnu', () => {
    expect(echeanceBilanSixAns(null, '2022-05-10')).toBe('2028-05-10');
    expect(echeanceBilanSixAns(null, null)).toBeNull();
  });
});

describe('statutEcheance', () => {
  it('en retard si l’échéance est dépassée', () => {
    expect(statutEcheance('2026-10-18', TODAY)).toBe('en_retard');
  });

  it('à planifier dans les 60 jours (bornes incluses) ou si inconnue', () => {
    expect(statutEcheance(TODAY, TODAY)).toBe('a_planifier');
    expect(statutEcheance('2026-12-18', TODAY)).toBe('a_planifier');
    expect(statutEcheance(null, TODAY)).toBe('a_planifier');
  });

  it('à jour au-delà du seuil', () => {
    expect(statutEcheance('2026-12-19', TODAY)).toBe('a_jour');
    expect(statutEcheance('2026-11-30', TODAY, 30)).toBe('a_jour');
  });
});

describe('prédicats', () => {
  it('reconnaît les entretiens professionnels et réalisés', () => {
    expect(estEntretienProfessionnel('professionnel')).toBe(true);
    expect(estEntretienProfessionnel('bilan_6_ans')).toBe(true);
    expect(estEntretienProfessionnel('annuel')).toBe(false);
    expect(estEntretienRealise('signe')).toBe(true);
    expect(estEntretienRealise('planifie')).toBe(false);
  });
});

describe('calculerSuiviEntretienPro', () => {
  it('sans entretien : référence = date d’entrée', () => {
    const s = calculerSuiviEntretienPro({ dateEntree: '2024-06-01', entretiens: [] }, TODAY);
    expect(s.dernierEntretien).toBeNull();
    expect(s.prochaineEcheance).toBe('2026-06-01');
    expect(s.statut).toBe('en_retard');
    expect(s.joursRestants).toBeLessThan(0);
    expect(s.echeanceBilan).toBe('2030-06-01');
    expect(s.statutBilan).toBe('a_jour');
    expect(s.entretienPlanifie).toBeNull();
  });

  it('retient le dernier entretien professionnel réalisé et ignore les autres types', () => {
    const s = calculerSuiviEntretienPro(
      {
        dateEntree: '2020-01-01',
        entretiens: [
          entretien({ id: 'a', dateRealisation: '2024-11-20' }),
          entretien({ id: 'b', statut: 'signe', dateRealisation: '2025-12-01' }),
          entretien({ id: 'c', typeEntretien: 'annuel', dateRealisation: '2026-09-01' }),
          entretien({ id: 'd', statut: 'annule', dateRealisation: null }),
        ],
      },
      TODAY,
    );
    expect(s.dernierEntretien).toBe('2025-12-01');
    expect(s.dernierEntretienId).toBe('b');
    expect(s.prochaineEcheance).toBe('2027-12-01');
    expect(s.statut).toBe('a_jour');
  });

  it('un bilan 6 ans relance aussi le cycle de 2 ans', () => {
    const s = calculerSuiviEntretienPro(
      {
        dateEntree: '2014-09-01',
        entretiens: [
          entretien({ id: 'bilan', typeEntretien: 'bilan_6_ans', dateRealisation: '2020-07-01' }),
          entretien({ id: 'pro', dateRealisation: '2022-08-01' }),
        ],
      },
      TODAY,
    );
    expect(s.dernierBilan).toBe('2020-07-01');
    expect(s.dernierEntretien).toBe('2022-08-01');
    expect(s.prochaineEcheance).toBe('2024-08-01');
    expect(s.statut).toBe('en_retard');
    expect(s.echeanceBilan).toBe('2026-09-01');
    expect(s.statutBilan).toBe('en_retard');
  });

  it('remonte le prochain entretien professionnel déjà créé (date prévue la plus proche)', () => {
    const s = calculerSuiviEntretienPro(
      {
        dateEntree: '2024-11-01',
        entretiens: [
          entretien({ id: 'x', statut: 'a_planifier' }),
          entretien({ id: 'y', statut: 'planifie', datePrevue: '2026-11-15' }),
          entretien({
            id: 'z',
            typeEntretien: 'annuel',
            statut: 'planifie',
            datePrevue: '2026-10-25',
          }),
        ],
      },
      TODAY,
    );
    expect(s.statut).toBe('a_planifier');
    expect(s.entretienPlanifie).toEqual({
      id: 'y',
      typeEntretien: 'professionnel',
      datePrevue: '2026-11-15',
    });
  });

  it('sans aucune date : à planifier, échéances inconnues', () => {
    const s = calculerSuiviEntretienPro({ dateEntree: null, entretiens: [] }, TODAY);
    expect(s.prochaineEcheance).toBeNull();
    expect(s.joursRestants).toBeNull();
    expect(s.statut).toBe('a_planifier');
    expect(s.echeanceBilan).toBeNull();
    expect(s.statutBilan).toBeNull();
  });
});
