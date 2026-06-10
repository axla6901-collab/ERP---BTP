import { describe, expect, it } from 'vitest';

import {
  documentTierSchema,
  LIBELLES_TYPE_DOCUMENT_TIER,
  TYPES_DOCUMENT_TIER,
} from '@/lib/validation/tiers';

const base = {
  type: 'kbis' as const,
  libelle: 'Extrait K-BIS 2026',
  mimeType: 'application/pdf',
  tailleBytes: 12_345,
  minioKey: 'tiers/sous-traitants/abc/1700000000000-deadbeef-kbis.pdf',
  dateValidite: '2026-12-31',
  notes: 'Reçu par mail',
};

describe('documentTierSchema', () => {
  it('accepte un document valide complet', () => {
    const r = documentTierSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe('kbis');
      expect(r.data.tailleBytes).toBe(12_345);
      expect(r.data.dateValidite).toBe('2026-12-31');
    }
  });

  it('autorise une taille absente (null)', () => {
    const r = documentTierSchema.safeParse({ ...base, tailleBytes: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tailleBytes).toBeNull();
  });

  it('rejette une taille négative ou nulle', () => {
    expect(documentTierSchema.safeParse({ ...base, tailleBytes: -1 }).success).toBe(false);
    expect(documentTierSchema.safeParse({ ...base, tailleBytes: 0 }).success).toBe(false);
  });

  it('rejette une date de validité au mauvais format', () => {
    expect(documentTierSchema.safeParse({ ...base, dateValidite: '31/12/2026' }).success).toBe(
      false,
    );
  });

  it('autorise une date de validité absente (null)', () => {
    const r = documentTierSchema.safeParse({ ...base, dateValidite: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.dateValidite).toBeNull();
  });

  it('exige un libellé non vide', () => {
    expect(documentTierSchema.safeParse({ ...base, libelle: '' }).success).toBe(false);
    expect(documentTierSchema.safeParse({ ...base, libelle: '   ' }).success).toBe(false);
  });

  it('exige une minioKey et un mimeType', () => {
    expect(documentTierSchema.safeParse({ ...base, minioKey: '' }).success).toBe(false);
    expect(documentTierSchema.safeParse({ ...base, mimeType: '' }).success).toBe(false);
  });

  it('rejette un type inconnu', () => {
    expect(documentTierSchema.safeParse({ ...base, type: 'inconnu' }).success).toBe(false);
  });

  it('normalise des notes vides en null', () => {
    const r = documentTierSchema.safeParse({ ...base, notes: '   ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.notes).toBeNull();
  });
});

describe('référentiel des types de document tier', () => {
  it('a un libellé pour chaque type', () => {
    for (const t of TYPES_DOCUMENT_TIER) {
      expect(LIBELLES_TYPE_DOCUMENT_TIER[t]).toBeTruthy();
    }
  });

  it('couvre les documents légaux BTP attendus', () => {
    expect(TYPES_DOCUMENT_TIER).toContain('kbis');
    expect(TYPES_DOCUMENT_TIER).toContain('attestation_urssaf');
    expect(TYPES_DOCUMENT_TIER).toContain('assurance_decennale');
  });
});
