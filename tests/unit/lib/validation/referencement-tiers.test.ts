import { describe, expect, it } from 'vitest';

import {
  agrementActionSchema,
  corpsEtatSchema,
  natureDocumentSchema,
  societeSchema,
  tierSchema,
} from '@/lib/validation/referencement-tiers';

describe('corpsEtatSchema', () => {
  it('met le code en majuscules et applique les valeurs par défaut', () => {
    const r = corpsEtatSchema.safeParse({ code: 'gros_oeuvre', libelle: 'Gros œuvre' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.code).toBe('GROS_OEUVRE');
      expect(r.data.ordreAffichage).toBe(0);
      expect(r.data.actif).toBe(true);
    }
  });

  it('rejette un code trop court ou avec espace', () => {
    expect(corpsEtatSchema.safeParse({ code: 'a', libelle: 'Trop court' }).success).toBe(false);
    expect(corpsEtatSchema.safeParse({ code: 'a b', libelle: 'Avec espace' }).success).toBe(false);
  });

  it('rejette un libellé trop court', () => {
    expect(corpsEtatSchema.safeParse({ code: 'GO', libelle: 'x' }).success).toBe(false);
  });
});

describe('natureDocumentSchema', () => {
  it('accepte duree_jours avec un délai de validité', () => {
    const r = natureDocumentSchema.safeParse({
      code: 'KBIS',
      libelle: 'Extrait K-bis',
      modeControle: 'duree_jours',
      delaiValiditeJours: 180,
      delaiRelanceJours: 10,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.delaiValiditeJours).toBe(180);
  });

  it('refuse duree_jours sans délai de validité', () => {
    const r = natureDocumentSchema.safeParse({
      code: 'KBIS',
      libelle: 'Extrait K-bis',
      modeControle: 'duree_jours',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('delaiValiditeJours'))).toBe(true);
    }
  });

  it('refuse case_a_cocher avec un délai de validité', () => {
    const r = natureDocumentSchema.safeParse({
      code: 'PPSPS',
      libelle: 'PPSPS',
      modeControle: 'case_a_cocher',
      delaiValiditeJours: 30,
    });
    expect(r.success).toBe(false);
  });

  it('accepte case_a_cocher sans délai (délai null)', () => {
    const r = natureDocumentSchema.safeParse({
      code: 'PPSPS',
      libelle: 'PPSPS',
      modeControle: 'case_a_cocher',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.delaiValiditeJours).toBeNull();
  });

  it('accepte date_fin_assurance avec une tolérance', () => {
    const r = natureDocumentSchema.safeParse({
      code: 'DEC',
      libelle: 'Assurance décennale',
      modeControle: 'date_fin_assurance',
      delaiValiditeJours: 15,
    });
    expect(r.success).toBe(true);
  });
});

describe('societeSchema', () => {
  it('met le code en majuscules et accepte un SIRET absent', () => {
    const r = societeSchema.safeParse({ code: 'sbi', raisonSociale: 'SBI Bâtiment' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.code).toBe('SBI');
      expect(r.data.siret).toBeNull();
    }
  });

  it('rejette un SIRET mal formé', () => {
    expect(
      societeSchema.safeParse({ code: 'SBI', raisonSociale: 'SBI', siret: '123' }).success,
    ).toBe(false);
  });
});

describe('agrementActionSchema', () => {
  it('exige un motif pour un refus', () => {
    expect(agrementActionSchema.safeParse({ action: 'refuser' }).success).toBe(false);
    expect(
      agrementActionSchema.safeParse({ action: 'refuser', motif: 'Documents non conformes' })
        .success,
    ).toBe(true);
  });

  it('autorise un agrément sans motif', () => {
    const r = agrementActionSchema.safeParse({ action: 'agreer' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.motif).toBeNull();
  });

  it('rejette une action inconnue', () => {
    expect(agrementActionSchema.safeParse({ action: 'archiver' }).success).toBe(false);
  });
});

describe('tierSchema', () => {
  it('normalise un tier minimal valide', () => {
    const r = tierSchema.safeParse({
      code: 'art001',
      nom: 'Maçonnerie Dupont',
      natureTiers: 'artisan',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.code).toBe('ART001');
      expect(r.data.corpsEtatIds).toEqual([]);
      expect(r.data.societeIds).toEqual([]);
      expect(r.data.siret).toBeNull();
      expect(r.data.actif).toBe(true);
      expect(r.data.pays).toBe('France');
    }
  });

  it('rejette une nature inconnue', () => {
    expect(tierSchema.safeParse({ code: 'X1', nom: 'Test', natureTiers: 'inconnue' }).success).toBe(
      false,
    );
  });

  it('rejette un SIRET à 13 chiffres', () => {
    expect(
      tierSchema.safeParse({
        code: 'X1',
        nom: 'Test',
        natureTiers: 'artisan',
        siret: '1234567890123',
      }).success,
    ).toBe(false);
  });
});
