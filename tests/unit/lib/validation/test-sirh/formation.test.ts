import { describe, expect, it } from 'vitest';

import {
  formationSchema,
  inscriptionSchema,
  inscriptionsSchema,
  sessionSchema,
} from '@/lib/validation/test-sirh/formation';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID2 = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('formationSchema', () => {
  const valide = {
    code: 'SST',
    intitule: 'Sauveteur secouriste du travail',
    categorie: 'securite',
    organisme: 'INRS',
    modalite: 'presentiel',
    dureeHeures: '14',
    coutHt: '250,5',
    obligatoire: false,
    validiteMois: '24',
    description: '',
    actif: true,
  };

  it('accepte une formation et normalise les nombres', () => {
    const r = formationSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data?.dureeHeures).toBe('14.00');
    expect(r.data?.coutHt).toBe('250.50');
    expect(r.data?.validiteMois).toBe(24);
    expect(r.data?.description).toBeNull();
  });

  it('champs numériques optionnels', () => {
    const r = formationSchema.safeParse({
      ...valide,
      dureeHeures: '',
      coutHt: null,
      validiteMois: '',
    });
    expect(r.success).toBe(true);
    expect(r.data?.validiteMois).toBeNull();
  });

  it('refuse une durée nulle, une validité hors 1–240 ou un intitulé vide', () => {
    expect(formationSchema.safeParse({ ...valide, dureeHeures: '0' }).success).toBe(false);
    expect(formationSchema.safeParse({ ...valide, validiteMois: 241 }).success).toBe(false);
    expect(formationSchema.safeParse({ ...valide, validiteMois: '1.5' }).success).toBe(false);
    expect(formationSchema.safeParse({ ...valide, intitule: '' }).success).toBe(false);
    expect(formationSchema.safeParse({ ...valide, categorie: 'sport' }).success).toBe(false);
  });
});

describe('sessionSchema', () => {
  const valide = {
    formationId: UUID,
    dateDebut: '2026-11-03',
    dateFin: '2026-11-04',
    lieu: 'Centre AFPA',
    formateur: null,
    placesMax: '8',
    coutHt: '',
    statut: 'planifiee',
    notes: null,
  };

  it('accepte une session', () => {
    const r = sessionSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data?.placesMax).toBe(8);
    expect(r.data?.coutHt).toBeNull();
  });

  it('refuse une fin avant le début, des dates manquantes ou une jauge nulle', () => {
    const r = sessionSchema.safeParse({ ...valide, dateFin: '2026-11-02' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['dateFin']);
    expect(sessionSchema.safeParse({ ...valide, dateDebut: '' }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...valide, placesMax: 0 }).success).toBe(false);
  });
});

describe('inscriptions', () => {
  it('dédoublonne les collaborateurs et exige au moins une sélection', () => {
    expect(
      inscriptionsSchema.safeParse({ sessionId: UUID, employeIds: [UUID2, UUID2] }).data
        ?.employeIds,
    ).toEqual([UUID2]);
    expect(inscriptionsSchema.safeParse({ sessionId: UUID, employeIds: [] }).success).toBe(false);
    expect(inscriptionsSchema.safeParse({ sessionId: UUID, employeIds: ['x'] }).success).toBe(
      false,
    );
  });

  it('présence et résultat cohérents', () => {
    const base = {
      id: UUID,
      statut: 'present',
      resultat: 'reussi',
      heuresRealisees: '7',
      commentaire: null,
    };
    const r = inscriptionSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.heuresRealisees).toBe('7.00');
    const absent = inscriptionSchema.safeParse({ ...base, statut: 'absent' });
    expect(absent.success).toBe(false);
    expect(absent.error?.issues[0]?.path).toEqual(['resultat']);
    expect(
      inscriptionSchema.safeParse({ ...base, statut: 'absent', resultat: 'non_evalue' }).success,
    ).toBe(true);
    expect(inscriptionSchema.safeParse({ ...base, heuresRealisees: '-1' }).success).toBe(false);
  });
});
