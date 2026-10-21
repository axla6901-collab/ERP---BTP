import { describe, expect, it } from 'vitest';

import {
  campagneSchema,
  changementStatutCampagneSchema,
  commentaireSalarieSchema,
  compteRenduSchema,
  lancementCampagneSchema,
  nouvelEntretienSchema,
  objectifSchema,
  planificationEntretienSchema,
} from '@/lib/validation/test-sirh/entretiens';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID2 = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('campagneSchema', () => {
  const valide = {
    libelle: 'Entretiens annuels 2026',
    typeEntretien: 'annuel',
    dateDebut: '2026-11-01',
    dateLimite: '2026-12-31',
    description: '',
  };

  it('accepte une campagne et normalise les champs vides', () => {
    const r = campagneSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data?.description).toBeNull();
  });

  it('refuse un libellé vide, un type inconnu ou une date limite antérieure au début', () => {
    expect(campagneSchema.safeParse({ ...valide, libelle: ' ' }).success).toBe(false);
    expect(campagneSchema.safeParse({ ...valide, typeEntretien: 'trimestriel' }).success).toBe(
      false,
    );
    const r = campagneSchema.safeParse({ ...valide, dateLimite: '2026-10-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['dateLimite']);
  });

  it('accepte des dates absentes', () => {
    expect(campagneSchema.safeParse({ ...valide, dateDebut: null, dateLimite: '' }).success).toBe(
      true,
    );
  });
});

describe('lancement et statut de campagne', () => {
  it('filtres de site / équipe optionnels', () => {
    expect(
      lancementCampagneSchema.safeParse({ campagneId: UUID, siteId: '', equipeId: null }).data,
    ).toEqual({ campagneId: UUID, siteId: null, equipeId: null });
    expect(
      lancementCampagneSchema.safeParse({ campagneId: 'x', siteId: null, equipeId: null }).success,
    ).toBe(false);
  });

  it('statut de campagne limité à l’énumération', () => {
    expect(changementStatutCampagneSchema.safeParse({ id: UUID, statut: 'cloturee' }).success).toBe(
      true,
    );
    expect(changementStatutCampagneSchema.safeParse({ id: UUID, statut: 'archivee' }).success).toBe(
      false,
    );
  });
});

describe('entretiens', () => {
  const nouvel = {
    campagneId: null,
    employeId: UUID,
    evaluateurId: UUID2,
    typeEntretien: 'professionnel',
    datePrevue: '2026-11-15',
  };

  it('crée un entretien hors campagne', () => {
    expect(nouvelEntretienSchema.safeParse(nouvel).success).toBe(true);
  });

  it('refuse un évaluateur identique au collaborateur', () => {
    const r = nouvelEntretienSchema.safeParse({ ...nouvel, evaluateurId: UUID });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['evaluateurId']);
  });

  it('planification : date prévue optionnelle', () => {
    expect(
      planificationEntretienSchema.safeParse({
        id: UUID,
        evaluateurId: null,
        typeEntretien: 'annuel',
        datePrevue: '',
      }).data?.datePrevue,
    ).toBeNull();
  });
});

describe('compteRenduSchema', () => {
  const base = {
    id: UUID,
    statut: 'realise',
    datePrevue: '2026-10-10',
    dateRealisation: '2026-10-12',
    noteGlobale: '4',
    synthese: 'Très bonne année.',
    pointsForts: null,
    axesAmelioration: '',
    souhaitsFormation: 'CACES R482',
    souhaitsEvolution: null,
    commentaireSalarie: null,
  };

  it('accepte un compte rendu réalisé et convertit la note', () => {
    const r = compteRenduSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.noteGlobale).toBe(4);
    expect(r.data?.axesAmelioration).toBeNull();
  });

  it('refuse une note hors 1–5', () => {
    expect(compteRenduSchema.safeParse({ ...base, noteGlobale: 6 }).success).toBe(false);
  });

  it('exige la date de réalisation d’un entretien réalisé', () => {
    const r = compteRenduSchema.safeParse({ ...base, dateRealisation: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['dateRealisation']);
  });

  it('exige la date prévue d’un entretien planifié', () => {
    const r = compteRenduSchema.safeParse({
      ...base,
      statut: 'planifie',
      datePrevue: null,
      dateRealisation: null,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['datePrevue']);
  });

  it('commentaire du salarié borné', () => {
    expect(
      commentaireSalarieSchema.safeParse({ id: UUID, commentaireSalarie: 'Merci' }).success,
    ).toBe(true);
    expect(
      commentaireSalarieSchema.safeParse({ id: UUID, commentaireSalarie: 'x'.repeat(5001) })
        .success,
    ).toBe(false);
  });
});

describe('objectifSchema', () => {
  const valide = {
    employeId: UUID,
    entretienId: null,
    libelle: 'Obtenir le CACES R482',
    description: null,
    dateEcheance: '2027-06-30',
    poids: '30',
    progression: '25',
    statut: 'en_cours',
  };

  it('accepte un objectif et convertit les entiers', () => {
    const r = objectifSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data?.poids).toBe(30);
    expect(r.data?.progression).toBe(25);
  });

  it('refuse une progression ou un poids hors 0–100 et un libellé vide', () => {
    expect(objectifSchema.safeParse({ ...valide, progression: 101 }).success).toBe(false);
    expect(objectifSchema.safeParse({ ...valide, progression: '' }).success).toBe(false);
    expect(objectifSchema.safeParse({ ...valide, poids: -1 }).success).toBe(false);
    expect(objectifSchema.safeParse({ ...valide, libelle: '' }).success).toBe(false);
  });
});
