import { describe, expect, it } from 'vitest';

import {
  attributionMaterielSchema,
  materielSchema,
  restitutionMaterielSchema,
} from '@/lib/validation/test-sirh/materiel';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID_2 = '9b1d4c2e-7a3f-4c8d-8e2b-1f0a9c8d7e6b';

describe('materielSchema', () => {
  const valide = {
    categorie: 'epi' as const,
    libelle: 'Harnais antichute',
    marque: 'Petzl',
    modele: 'Newton',
    numeroSerie: 'PZ-2026-0042',
    taille: 'L',
    dateAchat: '2026-01-10',
    valeurAchat: '189,90',
    dateFinGarantie: '2029-01-10',
    dateControle: '2027-01-10',
    statut: 'en_stock' as const,
    notes: null,
  };

  it('accepte un EPI complet et normalise la valeur', () => {
    const r = materielSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data?.valeurAchat).toBe('189.90');
  });

  it('champs optionnels vides → null', () => {
    const r = materielSchema.parse({
      ...valide,
      marque: '',
      modele: '',
      numeroSerie: ' ',
      taille: '',
      dateAchat: '',
      valeurAchat: '',
      dateFinGarantie: '',
      dateControle: '',
    });
    expect(r).toMatchObject({
      marque: null,
      numeroSerie: null,
      dateAchat: null,
      valeurAchat: null,
      dateControle: null,
    });
  });

  it('refuse un libellé vide, une catégorie inconnue, une valeur négative, une garantie antérieure à l’achat', () => {
    expect(materielSchema.safeParse({ ...valide, libelle: '' }).success).toBe(false);
    expect(materielSchema.safeParse({ ...valide, categorie: 'vehicule' }).success).toBe(false);
    expect(materielSchema.safeParse({ ...valide, valeurAchat: '-5' }).success).toBe(false);
    const r = materielSchema.safeParse({ ...valide, dateFinGarantie: '2025-12-31' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['dateFinGarantie']);
  });
});

describe('attribution / restitution', () => {
  it('attribution : matériel, collaborateur et date de remise requis', () => {
    const valide = {
      materielId: UUID,
      employeId: UUID_2,
      dateRemise: '2026-10-19',
      etatRemise: 'Neuf',
      dechargeSignee: true,
      commentaire: '',
    };
    const r = attributionMaterielSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data?.commentaire).toBeNull();
    expect(attributionMaterielSchema.safeParse({ ...valide, employeId: '' }).success).toBe(false);
    expect(attributionMaterielSchema.safeParse({ ...valide, dateRemise: '' }).success).toBe(false);
  });

  it('restitution : date de retour requise', () => {
    const valide = {
      materielId: UUID,
      dateRetour: '2026-10-20',
      etatRetour: 'Sangle usée',
      signalerReparation: true,
      commentaire: null,
    };
    expect(restitutionMaterielSchema.safeParse(valide).success).toBe(true);
    expect(
      restitutionMaterielSchema.safeParse({ ...valide, dateRetour: '20/10/2026' }).success,
    ).toBe(false);
  });
});
