import { describe, expect, it } from 'vitest';

import {
  periodePaieSchema,
  statutPeriodeSchema,
  variablePaieSchema,
} from '@/lib/validation/test-sirh/paie';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID2 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f71';

describe('periodePaieSchema', () => {
  it('accepte un mois de paie', () => {
    expect(periodePaieSchema.parse({ annee: '2026', mois: 10, notes: '' })).toEqual({
      annee: 2026,
      mois: 10,
      notes: null,
    });
  });

  it('refuse un mois ou une année hors bornes', () => {
    expect(periodePaieSchema.safeParse({ annee: 2026, mois: 13, notes: null }).success).toBe(false);
    expect(periodePaieSchema.safeParse({ annee: 1999, mois: 1, notes: null }).success).toBe(false);
    expect(periodePaieSchema.safeParse({ annee: 2026, mois: '', notes: null }).success).toBe(false);
  });
});

describe('statutPeriodeSchema', () => {
  it('valide le statut cible', () => {
    expect(statutPeriodeSchema.safeParse({ id: UUID, statut: 'cloturee' }).success).toBe(true);
    expect(statutPeriodeSchema.safeParse({ id: UUID, statut: 'archivee' }).success).toBe(false);
  });
});

describe('variablePaieSchema', () => {
  const valide = {
    periodeId: UUID,
    employeId: UUID2,
    typeVariable: 'prime',
    libelle: 'Prime de panier',
    codeRubrique: 'P100',
    quantite: '',
    montant: '150,5',
    commentaire: null,
  };

  it('accepte une variable avec montant seul', () => {
    const r = variablePaieSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ quantite: null, montant: '150.50' });
  });

  it('accepte une quantité seule et un montant négatif (régularisation)', () => {
    expect(variablePaieSchema.parse({ ...valide, quantite: '1,5', montant: null }).quantite).toBe(
      '1.50',
    );
    expect(variablePaieSchema.parse({ ...valide, montant: '-50' }).montant).toBe('-50.00');
  });

  it('exige une quantité ou un montant', () => {
    const r = variablePaieSchema.safeParse({ ...valide, quantite: null, montant: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join('.'))).toContain('quantite');
  });

  it('refuse un type inconnu ou un libellé vide', () => {
    expect(variablePaieSchema.safeParse({ ...valide, typeVariable: 'bonus' }).success).toBe(false);
    expect(variablePaieSchema.safeParse({ ...valide, libelle: '' }).success).toBe(false);
  });
});
