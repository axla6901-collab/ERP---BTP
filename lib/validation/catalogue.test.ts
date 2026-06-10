import { describe, expect, it } from 'vitest';

import {
  articleSchema,
  familleSchema,
  nomenclatureLigneSchema,
  nomenclatureSchema,
  prixArticleSchema,
  uniteSchema,
} from './catalogue';

const UUID = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';

describe('uniteSchema', () => {
  it('accepte un input valide et upper-case le code', () => {
    const r = uniteSchema.parse({
      code: 'kg',
      libelle: 'Kilogramme',
      symbole: 'kg',
      type: 'masse',
      actif: true,
    });
    expect(r.code).toBe('KG');
    expect(r.type).toBe('masse');
  });

  it('refuse un type inconnu', () => {
    expect(() =>
      uniteSchema.parse({ code: 'XX', libelle: 'X', symbole: 'x', type: 'autre_chose', actif: true }),
    ).toThrow();
  });
});

describe('familleSchema', () => {
  it('accepte une famille racine (sans parent)', () => {
    const r = familleSchema.parse({
      code: 'gros-oeuvre',
      libelle: 'Gros œuvre',
      parentId: null,
      ordre: 0,
      actif: true,
    });
    expect(r.code).toBe('GROS-OEUVRE');
    expect(r.parentId).toBeNull();
  });

  it('accepte une sous-famille avec parentId UUID', () => {
    const r = familleSchema.parse({
      code: 'MACONNERIE',
      libelle: 'Maçonnerie',
      parentId: UUID,
      ordre: 0,
      actif: true,
    });
    expect(r.parentId).toBe(UUID);
  });

  it('refuse un parentId non-UUID', () => {
    expect(() =>
      familleSchema.parse({
        code: 'MACONNERIE',
        libelle: 'Maçonnerie',
        parentId: 'pas-uuid',
        ordre: 0,
        actif: true,
      }),
    ).toThrow(/Identifiant invalide/);
  });
});

describe('articleSchema', () => {
  it('accepte un article simple complet', () => {
    const r = articleSchema.parse({
      code: 'CIM01',
      libelle: 'Sac ciment 25 kg',
      familleId: UUID,
      type: 'simple',
      uniteAchatId: UUID2,
      uniteStockId: UUID2,
      uniteVenteId: UUID2,
      actif: true,
    });
    expect(r.code).toBe('CIM01');
    expect(r.type).toBe('simple');
  });

  it('accepte un article composé avec caractéristiques physiques', () => {
    const r = articleSchema.parse({
      code: 'TOLE12',
      libelle: 'Tôle acier 12 mm',
      familleId: UUID,
      type: 'compose',
      uniteAchatId: UUID2,
      uniteStockId: UUID2,
      uniteVenteId: UUID2,
      densite: 7.85,
      epaisseur: '12,0',
      actif: true,
    });
    expect(r.densite).toBe('7.8500');
    expect(r.epaisseur).toBe('12.0000');
  });

  it('refuse une densité négative', () => {
    expect(() =>
      articleSchema.parse({
        code: 'X',
        libelle: 'X',
        familleId: UUID,
        densite: -1,
      } as never),
    ).toThrow();
  });

  it('refuse un familleId non-UUID', () => {
    expect(() =>
      articleSchema.parse({
        code: 'X1',
        libelle: 'X1',
        familleId: 'oups',
      } as never),
    ).toThrow(/ID de famille invalide/);
  });
});

describe('nomenclatureLigneSchema', () => {
  it('accepte une ligne valide avec perte en %', () => {
    const r = nomenclatureLigneSchema.parse({
      composantArticleId: UUID,
      quantite: 20,
      uniteEmploiId: UUID2,
      coefficientPerte: 5,
      notes: null,
    });
    expect(r.coefficientPerte).toBe('0.0500');
    expect(r.quantite).toBe('20.0000');
  });

  it('accepte une perte décimale (0.05)', () => {
    const r = nomenclatureLigneSchema.parse({
      composantArticleId: UUID,
      quantite: 1,
      uniteEmploiId: UUID2,
      coefficientPerte: 0.05,
    });
    expect(r.coefficientPerte).toBe('0.0500');
  });

  it('refuse une quantité nulle', () => {
    expect(() =>
      nomenclatureLigneSchema.parse({
        composantArticleId: UUID,
        quantite: 0,
        uniteEmploiId: UUID2,
      }),
    ).toThrow();
  });
});

describe('nomenclatureSchema', () => {
  it('refuse une nomenclature vide', () => {
    expect(() => nomenclatureSchema.parse({ libelle: null, lignes: [] })).toThrow(/Au moins/);
  });

  it('accepte une nomenclature avec une ligne minimale', () => {
    const r = nomenclatureSchema.parse({
      libelle: null,
      lignes: [
        { composantArticleId: UUID, quantite: 8, uniteEmploiId: UUID2, coefficientPerte: 0 },
      ],
    });
    expect(r.lignes).toHaveLength(1);
  });
});

describe('prixArticleSchema', () => {
  it('accepte un prix de référence (sans fournisseur)', () => {
    const r = prixArticleSchema.parse({
      prixUnitaireHt: '12,50',
      uniteId: UUID,
      fournisseurId: null,
      validFrom: '2026-01-01',
    });
    expect(r.prixUnitaireHt).toBe('12.50');
    expect(r.fournisseurId).toBeNull();
  });

  it('refuse une date de fin antérieure au début', () => {
    expect(() =>
      prixArticleSchema.parse({
        prixUnitaireHt: '1',
        uniteId: UUID,
        validFrom: '2026-05-01',
        validTo: '2026-04-01',
      }),
    ).toThrow(/Date de fin/);
  });
});
