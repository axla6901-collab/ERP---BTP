import { describe, expect, it } from 'vitest';

import {
  contratStSchema,
  TRANSITIONS_CONTRAT_ST,
} from '@/lib/validation/contrat-st';
import {
  factureStSchema,
  paiementStSchema,
  TRANSITIONS_FACTURE_ST,
} from '@/lib/validation/facture-st';

const ST = '11111111-1111-4111-8111-111111111111';
const CH = '22222222-2222-4222-8222-222222222222';
const CONTRAT = '33333333-3333-4333-8333-333333333333';

const ligneLibre = {
  type: 'libre' as const,
  designation: 'Pose réseau',
  quantite: 10,
  unite: 'ml',
  prixUnitaireHt: 50,
  tauxTva: 20,
};

describe('contratStSchema', () => {
  it('accepte un contrat minimal et normalise le montant', () => {
    const r = contratStSchema.parse({
      sousTraitantId: ST,
      chantierId: CH,
      montantHt: 12500,
    });
    expect(r.montantHt).toBe('12500.00');
    expect(r.statut).toBe('brouillon');
    expect(r.tauxRetenueGarantie).toBe('0.00');
  });

  it('normalise le taux de retenue (virgule) et borne à 10 %', () => {
    expect(
      contratStSchema.parse({ sousTraitantId: ST, chantierId: CH, montantHt: 1, tauxRetenueGarantie: '5,5' })
        .tauxRetenueGarantie,
    ).toBe('5.50');
    expect(() =>
      contratStSchema.parse({ sousTraitantId: ST, chantierId: CH, montantHt: 1, tauxRetenueGarantie: 12 }),
    ).toThrow(/10 %/);
  });

  it('refuse un montant HT négatif', () => {
    expect(() =>
      contratStSchema.parse({ sousTraitantId: ST, chantierId: CH, montantHt: -1 }),
    ).toThrow(/Montant HT/);
  });

  it('refuse une date de fin antérieure au début', () => {
    expect(() =>
      contratStSchema.parse({
        sousTraitantId: ST,
        chantierId: CH,
        montantHt: 1,
        dateDebutPrevue: '2026-06-10',
        dateFinPrevue: '2026-06-01',
      }),
    ).toThrow(/fin prévue/);
  });

  it('définit des transitions de statut cohérentes (pas de retour depuis soldé/annulé)', () => {
    expect(TRANSITIONS_CONTRAT_ST.brouillon).toContain('actif');
    expect(TRANSITIONS_CONTRAT_ST.solde).toEqual([]);
    expect(TRANSITIONS_CONTRAT_ST.annule).toEqual([]);
  });
});

describe('factureStSchema', () => {
  it('auto-liquidation par défaut à true, retenue à 0, paiement direct à false', () => {
    const r = factureStSchema.parse({
      contratStId: CONTRAT,
      dateFacture: '2026-06-10',
      lignes: [ligneLibre],
    });
    expect(r.autoLiquidation).toBe(true);
    expect(r.paiementDirect).toBe(false);
    expect(r.retenueGarantiePct).toBe('0.00');
  });

  it('accepte paiement direct + retenue 5 %', () => {
    const r = factureStSchema.parse({
      contratStId: CONTRAT,
      dateFacture: '2026-06-10',
      paiementDirect: true,
      retenueGarantiePct: 5,
      lignes: [ligneLibre],
    });
    expect(r.paiementDirect).toBe(true);
    expect(r.retenueGarantiePct).toBe('5.00');
  });

  it('exige au moins une ligne', () => {
    expect(() =>
      factureStSchema.parse({ contratStId: CONTRAT, dateFacture: '2026-06-10', lignes: [] }),
    ).toThrow(/Au moins une ligne/);
  });

  it('refuse une retenue hors bornes', () => {
    expect(() =>
      factureStSchema.parse({
        contratStId: CONTRAT,
        dateFacture: '2026-06-10',
        retenueGarantiePct: 15,
        lignes: [ligneLibre],
      }),
    ).toThrow(/10 %/);
  });

  it('transitions identiques au workflow facture client', () => {
    expect(TRANSITIONS_FACTURE_ST.brouillon).toEqual(['emise', 'annulee']);
    expect(TRANSITIONS_FACTURE_ST.payee).toEqual([]);
  });
});

describe('paiementStSchema', () => {
  it('normalise le montant en toFixed(2)', () => {
    expect(paiementStSchema.parse({ montant: '1234,5' }).montant).toBe('1234.50');
  });

  it('refuse un montant nul ou négatif', () => {
    expect(() => paiementStSchema.parse({ montant: 0 })).toThrow(/invalide/);
    expect(() => paiementStSchema.parse({ montant: -10 })).toThrow(/invalide/);
  });
});
