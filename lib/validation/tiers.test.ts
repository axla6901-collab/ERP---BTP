import { describe, expect, it } from 'vitest';

import { fournisseurSchema, sousTraitantSchema } from './tiers';

describe('fournisseurSchema', () => {
  it('accepte un fournisseur minimal (sans SIRET ni contacts)', () => {
    const r = fournisseurSchema.parse({ code: 'POINTP', nom: 'Point P', actif: true });
    expect(r.code).toBe('POINTP');
    expect(r.siret).toBeNull();
  });

  it('accepte un SIRET valide (14 chiffres)', () => {
    const r = fournisseurSchema.parse({
      code: 'PP',
      nom: 'Point P',
      siret: '12345678901234',
      actif: true,
    });
    expect(r.siret).toBe('12345678901234');
  });

  it('refuse un SIRET malformé', () => {
    expect(() =>
      fournisseurSchema.parse({ code: 'PP', nom: 'Point P', siret: 'abc', actif: true }),
    ).toThrow(/SIRET invalide/);
  });
});

describe('sousTraitantSchema', () => {
  it('accepte un sous-traitant minimal (juste code + nom)', () => {
    const r = sousTraitantSchema.parse({
      code: 'ELEC-DURAND',
      nom: 'Durand Électricité',
      qualifications: [],
    });
    expect(r.code).toBe('ELEC-DURAND');
    expect(r.actif).toBe(true);
    expect(r.agrementDc4).toBe(false);
    expect(r.qualifications).toEqual([]);
  });

  it('applique le statut « a_qualifier » par défaut', () => {
    const r = sousTraitantSchema.parse({ code: 'XX', nom: 'X X', qualifications: [] });
    expect(r.statut).toBe('a_qualifier');
  });

  it('accepte un statut d’agrément valide', () => {
    const r = sousTraitantSchema.parse({
      code: 'XX',
      nom: 'X X',
      qualifications: [],
      statut: 'agree',
    });
    expect(r.statut).toBe('agree');
  });

  it('refuse un statut d’agrément inconnu', () => {
    expect(() =>
      sousTraitantSchema.parse({
        code: 'XX',
        nom: 'X X',
        qualifications: [],
        statut: 'inconnu',
      }),
    ).toThrow();
  });

  it('accepte un sous-traitant complet (BTP)', () => {
    const r = sousTraitantSchema.parse({
      code: 'PLOM01',
      nom: 'Plombier SAS',
      siret: '12345678901234',
      nTvaIntra: 'FR12345678901',
      email: 'contact@plombier.fr',
      telephone: '0102030405',
      assuranceDecennaleNum: 'AXA-12345',
      assuranceDecennaleDateFin: '2027-12-31',
      qualifications: ['Qualibat 5113', 'RGE'],
      agrementDc4: true,
      dateAttestationUrssaf: '2026-04-01',
      actif: true,
    });
    expect(r.nTvaIntra).toBe('FR12345678901');
    expect(r.qualifications).toEqual(['Qualibat 5113', 'RGE']);
    expect(r.agrementDc4).toBe(true);
  });

  it('refuse un n° TVA intracom mal formé', () => {
    expect(() =>
      sousTraitantSchema.parse({
        code: 'X',
        nom: 'X X',
        nTvaIntra: '12345',
        qualifications: [],
      }),
    ).toThrow(/TVA intracom invalide/);
  });

  it('refuse plus de 20 qualifications', () => {
    const tropDeQualifs = Array.from({ length: 21 }, (_, i) => `Q${i}`);
    expect(() =>
      sousTraitantSchema.parse({
        code: 'X',
        nom: 'X X',
        qualifications: tropDeQualifs,
      }),
    ).toThrow(/Trop de qualifications/);
  });

  it('refuse une date de fin de décennale mal formée', () => {
    expect(() =>
      sousTraitantSchema.parse({
        code: 'X',
        nom: 'X X',
        assuranceDecennaleDateFin: 'pas-une-date',
        qualifications: [],
      }),
    ).toThrow(/Date invalide/);
  });

  // ── M8.1 : cascade (parent_st_id) + taux de retenue de garantie ──

  it('parentStId par défaut null et taux retenue par défaut 0.00', () => {
    const r = sousTraitantSchema.parse({ code: 'XX', nom: 'X X', qualifications: [] });
    expect(r.parentStId).toBeNull();
    expect(r.tauxRetenueGarantie).toBe('0.00');
  });

  it('convertit une chaîne vide de parentStId en null', () => {
    const r = sousTraitantSchema.parse({
      code: 'XX',
      nom: 'X X',
      qualifications: [],
      parentStId: '',
    });
    expect(r.parentStId).toBeNull();
  });

  it('accepte un parentStId UUID valide', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const r = sousTraitantSchema.parse({
      code: 'XX',
      nom: 'X X',
      qualifications: [],
      parentStId: uuid,
    });
    expect(r.parentStId).toBe(uuid);
  });

  it('refuse un parentStId non UUID', () => {
    expect(() =>
      sousTraitantSchema.parse({
        code: 'XX',
        nom: 'X X',
        qualifications: [],
        parentStId: 'pas-un-uuid',
      }),
    ).toThrow(/parent invalide/i);
  });

  it('normalise le taux de retenue (nombre et virgule) en chaîne toFixed(2)', () => {
    expect(
      sousTraitantSchema.parse({
        code: 'XX',
        nom: 'X X',
        qualifications: [],
        tauxRetenueGarantie: 5,
      }).tauxRetenueGarantie,
    ).toBe('5.00');
    expect(
      sousTraitantSchema.parse({
        code: 'XX',
        nom: 'X X',
        qualifications: [],
        tauxRetenueGarantie: '7,5',
      }).tauxRetenueGarantie,
    ).toBe('7.50');
  });

  it('refuse un taux de retenue hors bornes 0–10 %', () => {
    expect(() =>
      sousTraitantSchema.parse({
        code: 'XX',
        nom: 'X X',
        qualifications: [],
        tauxRetenueGarantie: 15,
      }),
    ).toThrow(/0 à 10/);
    expect(() =>
      sousTraitantSchema.parse({
        code: 'XX',
        nom: 'X X',
        qualifications: [],
        tauxRetenueGarantie: -1,
      }),
    ).toThrow(/0 à 10/);
  });
});
