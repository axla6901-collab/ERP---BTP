import { describe, expect, it } from 'vitest';

import {
  arreterCompteProrataSchema,
  compteProrataDepenseSchema,
  compteProrataFlagSchema,
  compteProrataParticipantSchema,
  ouvrirCompteProrataSchema,
} from '@/lib/validation/compte-prorata';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

describe('compteProrataFlagSchema', () => {
  it('accepte un booléen', () => {
    expect(compteProrataFlagSchema.safeParse({ actif: true }).success).toBe(true);
  });
  it('rejette une valeur non booléenne', () => {
    expect(compteProrataFlagSchema.safeParse({ actif: 'oui' }).success).toBe(false);
  });
});

describe('compteProrataParticipantSchema', () => {
  it('valide un participant minimal et coerce le montant', () => {
    const r = compteProrataParticipantSchema.safeParse({
      compteProrataId: UUID,
      libelle: 'Lot gros œuvre',
      montantMarcheHt: '40000',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.montantMarcheHt).toBe(40000);
      expect(r.data.estGestionnaire).toBe(false); // défaut
      expect(r.data.quotePartPctManuel).toBeNull(); // vide ⇒ null
    }
  });

  it('accepte la virgule décimale et un id (mise à jour)', () => {
    const r = compteProrataParticipantSchema.safeParse({
      id: UUID2,
      compteProrataId: UUID,
      libelle: 'Lot plomberie',
      montantMarcheHt: '12345,67',
      quotePartPctManuel: '33,33',
      estGestionnaire: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.montantMarcheHt).toBeCloseTo(12345.67, 2);
      expect(r.data.quotePartPctManuel).toBeCloseTo(33.33, 2);
      expect(r.data.id).toBe(UUID2);
    }
  });

  it('rejette un libellé vide', () => {
    const r = compteProrataParticipantSchema.safeParse({
      compteProrataId: UUID,
      libelle: '  ',
      montantMarcheHt: '0',
    });
    expect(r.success).toBe(false);
  });

  it('rejette un montant de marché négatif', () => {
    const r = compteProrataParticipantSchema.safeParse({
      compteProrataId: UUID,
      libelle: 'Lot',
      montantMarcheHt: '-1',
    });
    expect(r.success).toBe(false);
  });

  it('rejette une quote-part manuelle > 100', () => {
    const r = compteProrataParticipantSchema.safeParse({
      compteProrataId: UUID,
      libelle: 'Lot',
      montantMarcheHt: '0',
      quotePartPctManuel: '120',
    });
    expect(r.success).toBe(false);
  });
});

describe('compteProrataDepenseSchema', () => {
  const base = {
    compteProrataId: UUID,
    avanceParParticipantId: UUID2,
    dateDepense: '2026-06-10',
    libelle: 'Benne à gravats',
    montantHt: '500',
  };

  it('valide une dépense correcte', () => {
    const r = compteProrataDepenseSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.montantHt).toBe(500);
  });

  it('rejette un montant nul ou négatif', () => {
    expect(compteProrataDepenseSchema.safeParse({ ...base, montantHt: '0' }).success).toBe(false);
    expect(compteProrataDepenseSchema.safeParse({ ...base, montantHt: '-5' }).success).toBe(false);
  });

  it('rejette une date mal formée', () => {
    expect(
      compteProrataDepenseSchema.safeParse({ ...base, dateDepense: '10/06/2026' }).success,
    ).toBe(false);
  });

  it('rejette un payeur non-uuid', () => {
    expect(
      compteProrataDepenseSchema.safeParse({ ...base, avanceParParticipantId: 'x' }).success,
    ).toBe(false);
  });
});

describe('ouvrirCompteProrataSchema', () => {
  it('accepte des frais de gestion nuls (null)', () => {
    const r = ouvrirCompteProrataSchema.safeParse({ chantierId: UUID, fraisGestionPct: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fraisGestionPct).toBeNull();
  });
  it('rejette des frais de gestion > 100', () => {
    expect(
      ouvrirCompteProrataSchema.safeParse({ chantierId: UUID, fraisGestionPct: '150' }).success,
    ).toBe(false);
  });
});

describe('arreterCompteProrataSchema', () => {
  it('exige un compte + une date ISO', () => {
    expect(
      arreterCompteProrataSchema.safeParse({ compteProrataId: UUID, dateArrete: '2026-06-10' })
        .success,
    ).toBe(true);
    expect(
      arreterCompteProrataSchema.safeParse({ compteProrataId: UUID, dateArrete: 'hier' }).success,
    ).toBe(false);
  });
});
