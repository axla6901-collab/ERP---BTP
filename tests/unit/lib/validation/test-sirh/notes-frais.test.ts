import { describe, expect, it } from 'vitest';

import {
  noteFraisSchema,
  remboursementNoteFraisSchema,
} from '@/lib/validation/test-sirh/notes-frais';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID_2 = '9b1d4c2e-7a3f-4c8d-8e2b-1f0a9c8d7e6b';

const base = {
  employeId: UUID,
  dateDepense: '2026-10-15',
  nature: 'depense' as const,
  categorie: 'repas' as const,
  libelle: 'Déjeuner client chantier Les Tilleuls',
  montantTtc: '25,30',
  montantTva: '2,30',
  distanceKm: null,
  puissanceFiscale: null,
  vehiculeElectrique: false,
  tauxKm: null,
  nbForfaits: null,
  montantUnitaire: null,
  chantierId: UUID_2,
  justificatifDocumentId: null,
};

function erreurs(input: unknown): string[] {
  const r = noteFraisSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

describe('noteFraisSchema', () => {
  it('accepte une dépense et normalise les montants', () => {
    const r = noteFraisSchema.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data?.montantTtc).toBe('25.30');
    expect(r.data?.montantTva).toBe('2.30');
    expect(r.data?.chantierId).toBe(UUID_2);
  });

  it('dépense : montant TTC requis et TVA ≤ TTC', () => {
    expect(erreurs({ ...base, montantTtc: null })).toContain('montantTtc');
    expect(erreurs({ ...base, montantTtc: '0' })).toContain('montantTtc');
    expect(erreurs({ ...base, montantTva: '30' })).toContain('montantTva');
  });

  it('indemnités kilométriques : distance et puissance requises', () => {
    const ik = {
      ...base,
      nature: 'indemnite_km' as const,
      categorie: 'transport' as const,
      montantTtc: null,
      montantTva: null,
      distanceKm: '42,5',
      puissanceFiscale: '5',
      tauxKm: '0,636',
    };
    const r = noteFraisSchema.safeParse(ik);
    expect(r.success).toBe(true);
    expect(r.data?.distanceKm).toBe('42.5');
    expect(r.data?.puissanceFiscale).toBe(5);
    expect(r.data?.tauxKm).toBe('0.636');
    expect(erreurs({ ...ik, distanceKm: null })).toContain('distanceKm');
    expect(erreurs({ ...ik, distanceKm: '0' })).toContain('distanceKm');
    expect(erreurs({ ...ik, puissanceFiscale: null })).toContain('puissanceFiscale');
    expect(erreurs({ ...ik, puissanceFiscale: '60' })).toContain('puissanceFiscale');
    expect(erreurs({ ...ik, tauxKm: '15' })).toContain('tauxKm');
  });

  it('taux kilométrique facultatif (barème appliqué par le serveur)', () => {
    expect(
      noteFraisSchema.safeParse({
        ...base,
        nature: 'indemnite_km',
        montantTtc: null,
        montantTva: null,
        distanceKm: '12',
        puissanceFiscale: 4,
        tauxKm: '',
      }).success,
    ).toBe(true);
  });

  it('forfait : nombre et montant unitaire requis', () => {
    const forfait = {
      ...base,
      nature: 'forfait' as const,
      categorie: 'panier' as const,
      montantTtc: null,
      montantTva: null,
      nbForfaits: '5',
      montantUnitaire: '10,40',
    };
    expect(noteFraisSchema.safeParse(forfait).success).toBe(true);
    expect(erreurs({ ...forfait, nbForfaits: null })).toContain('nbForfaits');
    expect(erreurs({ ...forfait, montantUnitaire: '0' })).toContain('montantUnitaire');
  });

  it('refuse un libellé vide, une date invalide, une nature ou un employé inconnus', () => {
    expect(erreurs({ ...base, libelle: '  ' })).toContain('libelle');
    expect(erreurs({ ...base, dateDepense: '15/10/2026' })).toContain('dateDepense');
    expect(erreurs({ ...base, nature: 'cadeau' })).toContain('nature');
    expect(erreurs({ ...base, employeId: 'x' })).toContain('employeId');
    expect(erreurs({ ...base, justificatifDocumentId: 'pas-un-uuid' })).toContain(
      'justificatifDocumentId',
    );
  });
});

describe('remboursementNoteFraisSchema', () => {
  it('exige un identifiant et une date valides', () => {
    expect(
      remboursementNoteFraisSchema.safeParse({ id: UUID, dateRemboursement: '2026-10-31' }).success,
    ).toBe(true);
    expect(
      remboursementNoteFraisSchema.safeParse({ id: UUID, dateRemboursement: '' }).success,
    ).toBe(false);
    expect(
      remboursementNoteFraisSchema.safeParse({ id: 'x', dateRemboursement: '2026-10-31' }).success,
    ).toBe(false);
  });
});
