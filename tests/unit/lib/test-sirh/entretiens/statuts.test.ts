import { describe, expect, it } from 'vitest';

import {
  campagneLancable,
  compteRenduVerrouille,
  entretienSupprimable,
  statutApresPlanification,
  statutsAccessiblesEntretien,
  transitionCampagneAutorisee,
  transitionEntretienAutorisee,
  verifierCoherenceEntretien,
} from '@/lib/test-sirh/entretiens/statuts';
import { STATUTS_ENTRETIEN } from '@/lib/validation/test-sirh/enums';

describe('transitions d’entretien', () => {
  it('suit le cycle à planifier → planifié → réalisé → signé', () => {
    expect(transitionEntretienAutorisee('a_planifier', 'planifie')).toBe(true);
    expect(transitionEntretienAutorisee('planifie', 'realise')).toBe(true);
    expect(transitionEntretienAutorisee('realise', 'signe')).toBe(true);
  });

  it('autorise un entretien tenu sans planification préalable et l’annulation avant réalisation', () => {
    expect(transitionEntretienAutorisee('a_planifier', 'realise')).toBe(true);
    expect(transitionEntretienAutorisee('planifie', 'annule')).toBe(true);
    expect(transitionEntretienAutorisee('annule', 'a_planifier')).toBe(true);
  });

  it('refuse de sauter la réalisation ou de sortir d’un entretien signé', () => {
    expect(transitionEntretienAutorisee('planifie', 'signe')).toBe(false);
    expect(transitionEntretienAutorisee('realise', 'annule')).toBe(false);
    for (const s of STATUTS_ENTRETIEN) {
      if (s !== 'signe') expect(transitionEntretienAutorisee('signe', s)).toBe(false);
    }
  });

  it('le maintien du statut est toujours permis', () => {
    for (const s of STATUTS_ENTRETIEN) expect(transitionEntretienAutorisee(s, s)).toBe(true);
  });

  it('liste les statuts accessibles, statut courant en tête', () => {
    expect(statutsAccessiblesEntretien('realise')).toEqual(['realise', 'planifie', 'signe']);
    expect(statutsAccessiblesEntretien('signe')).toEqual(['signe']);
  });
});

describe('verrouillage et suppression', () => {
  it('fige le compte rendu signé ou annulé', () => {
    expect(compteRenduVerrouille('signe')).toBe(true);
    expect(compteRenduVerrouille('annule')).toBe(true);
    expect(compteRenduVerrouille('realise')).toBe(false);
  });

  it('conserve les entretiens tenus', () => {
    expect(entretienSupprimable('realise')).toBe(false);
    expect(entretienSupprimable('signe')).toBe(false);
    expect(entretienSupprimable('a_planifier')).toBe(true);
    expect(entretienSupprimable('annule')).toBe(true);
  });
});

describe('verifierCoherenceEntretien', () => {
  it('exige une date de réalisation pour un entretien réalisé ou signé', () => {
    expect(
      verifierCoherenceEntretien({ statut: 'realise', datePrevue: null, dateRealisation: null })
        ?.champ,
    ).toBe('dateRealisation');
    expect(
      verifierCoherenceEntretien({
        statut: 'signe',
        datePrevue: null,
        dateRealisation: '2026-10-01',
      }),
    ).toBeNull();
  });

  it('exige une date prévue pour un entretien planifié', () => {
    expect(
      verifierCoherenceEntretien({ statut: 'planifie', datePrevue: null, dateRealisation: null })
        ?.champ,
    ).toBe('datePrevue');
  });

  it('refuse une date de réalisation sur un entretien non réalisé', () => {
    const r = verifierCoherenceEntretien({
      statut: 'planifie',
      datePrevue: '2026-11-02',
      dateRealisation: '2026-11-02',
    });
    expect(r?.champ).toBe('dateRealisation');
    expect(r?.message).toMatch(/Réalisé/);
  });
});

describe('statutApresPlanification', () => {
  it('planifie un entretien daté et remet à planifier un entretien sans date', () => {
    expect(statutApresPlanification('a_planifier', '2026-11-02')).toBe('planifie');
    expect(statutApresPlanification('planifie', null)).toBe('a_planifier');
    expect(statutApresPlanification('realise', null)).toBe('realise');
    expect(statutApresPlanification('a_planifier', null)).toBe('a_planifier');
  });
});

describe('campagnes', () => {
  it('se lance depuis brouillon ou en cours, jamais une fois clôturée', () => {
    expect(campagneLancable('brouillon')).toBe(true);
    expect(campagneLancable('en_cours')).toBe(true);
    expect(campagneLancable('cloturee')).toBe(false);
  });

  it('se clôture et se rouvre ; le passage en cours manuel depuis brouillon est refusé', () => {
    expect(transitionCampagneAutorisee('en_cours', 'cloturee')).toBe(true);
    expect(transitionCampagneAutorisee('cloturee', 'en_cours')).toBe(true);
    expect(transitionCampagneAutorisee('brouillon', 'en_cours')).toBe(false);
    expect(transitionCampagneAutorisee('brouillon', 'cloturee')).toBe(false);
  });
});
