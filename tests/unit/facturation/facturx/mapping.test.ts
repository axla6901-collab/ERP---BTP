import { describe, expect, it } from 'vitest';

import {
  categorieTva,
  champsManquantsFacturX,
  construireDocumentFacturX,
  paysToCode,
  uniteToCode,
} from '@/lib/facturation/facturx/mapping';
import type { FacturXModel } from '@/lib/facturation/facturx/types';

const obj = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;
const arr = (v: unknown): unknown[] => v as unknown[];

function modeleBase(overrides: Partial<FacturXModel> = {}): FacturXModel {
  return {
    numero: 'F-2026-000001',
    dateFacture: '2026-06-10',
    dateEcheance: '2026-07-10',
    devise: 'EUR',
    autoLiquidation: false,
    objet: 'Travaux',
    conditionsPaiement: 'Paiement à 30 jours',
    mentionsLegales: 'Pénalités de retard applicables.',
    totalHt: 1000,
    totalTva: 200,
    totalTtc: 1200,
    remiseGlobaleMontant: 0,
    retenueGarantieMontant: 0,
    lignes: [
      {
        estSection: true,
        designation: 'Lot 1',
        articleCode: null,
        quantite: null,
        unite: null,
        prixUnitaireHt: null,
        montantHt: null,
        tauxTva: null,
      },
      {
        estSection: false,
        designation: 'Prestation',
        articleCode: 'ART-1',
        quantite: 10,
        unite: 'm²',
        prixUnitaireHt: 100,
        montantHt: 1000,
        tauxTva: 20,
      },
    ],
    tva: [{ taux: 20, base: 1000, montant: 200 }],
    emetteur: {
      raisonSociale: 'BTP Test SARL',
      siret: '81234567800025',
      tvaIntracom: 'FR40812345678',
      adresseLigne1: '12 rue X',
      adresseLigne2: null,
      codePostal: '69009',
      ville: 'Lyon',
      pays: 'France',
      iban: 'FR7630006000011234567890189',
      bic: 'AGRIFRPP',
      rcs: 'RCS Lyon B 812 345 678',
      formeJuridique: 'SARL',
      capitalSocial: '50000.00',
      codeApe: '4399C',
    },
    acheteur: {
      type: 'professionnel',
      nom: 'Client Pro SAS',
      siret: '52109876500014',
      tvaIntra: 'FR12521098765',
      adresseLigne1: '4 av Y',
      adresseLigne2: null,
      codePostal: '69003',
      ville: 'Lyon',
      pays: 'France',
    },
    ...overrides,
  };
}

describe('paysToCode', () => {
  it('mappe les libellés FR et les codes ISO', () => {
    expect(paysToCode('France')).toBe('FR');
    expect(paysToCode('FR')).toBe('FR');
    expect(paysToCode('Belgique')).toBe('BE');
  });
  it('retombe sur FR pour un libellé inconnu ou vide', () => {
    expect(paysToCode('Pays imaginaire')).toBe('FR');
    expect(paysToCode(null)).toBe('FR');
  });
});

describe('uniteToCode', () => {
  it('mappe les unités BTP courantes vers UN/ECE Rec 20', () => {
    expect(uniteToCode('m²')).toBe('MTK');
    expect(uniteToCode('m³')).toBe('MTQ');
    expect(uniteToCode('ml')).toBe('MTR');
    expect(uniteToCode('h')).toBe('HUR');
    expect(uniteToCode('kg')).toBe('KGM');
    expect(uniteToCode('U')).toBe('C62');
  });
  it('retombe sur C62 (unité) pour une unité inconnue', () => {
    expect(uniteToCode('bidon')).toBe('C62');
    expect(uniteToCode(null)).toBe('C62');
  });
});

describe('categorieTva', () => {
  it('standard / zéro / reverse-charge', () => {
    expect(categorieTva(20, false)).toBe('S');
    expect(categorieTva(0, false)).toBe('Z');
    expect(categorieTva(20, true)).toBe('AE');
    expect(categorieTva(10, true)).toBe('AE');
  });
});

describe('champsManquantsFacturX', () => {
  it('aucun champ manquant sur un modèle complet', () => {
    expect(champsManquantsFacturX(modeleBase())).toEqual([]);
  });
  it('signale un IBAN émetteur manquant', () => {
    const m = modeleBase();
    m.emetteur.iban = null;
    expect(champsManquantsFacturX(m).some((s) => s.includes('IBAN'))).toBe(true);
  });
  it('exige la TVA acheteur en auto-liquidation', () => {
    const m = modeleBase({ autoLiquidation: true });
    m.acheteur.tvaIntra = null;
    expect(champsManquantsFacturX(m).some((s) => s.includes('TVA'))).toBe(true);
  });
  it('exige au moins une ligne facturable (les sections ne comptent pas)', () => {
    const m = modeleBase({
      lignes: [
        {
          estSection: true,
          designation: 'Lot 1',
          articleCode: null,
          quantite: null,
          unite: null,
          prixUnitaireHt: null,
          montantHt: null,
          tauxTva: null,
        },
      ],
    });
    expect(champsManquantsFacturX(m).some((s) => s.includes('ligne'))).toBe(true);
  });
});

describe('construireDocumentFacturX — facture standard', () => {
  const doc = construireDocumentFacturX(modeleBase());
  const tx = obj(doc.transaction);
  const settlement = obj(tx.tradeSettlement);
  const sommation = obj(settlement.monetarySummation);

  it('en-tête : facture commerciale (380) et numéro', () => {
    expect(doc.number).toBe('F-2026-000001');
    expect(doc.typeCode).toBe('380');
    expect(doc.issueDate).toBeInstanceOf(Date);
  });
  it('exclut les lignes de section du XML', () => {
    expect(arr(tx.line)).toHaveLength(1);
  });
  it('porte l’émetteur (SIRET scheme 0009 + TVA) et l’acheteur', () => {
    const agreement = obj(tx.tradeAgreement);
    const seller = obj(agreement.seller);
    expect(seller.name).toBe('BTP Test SARL');
    const org = obj(seller.organization);
    expect(obj(org.registrationIdentifier).value).toBe('81234567800025');
    expect(obj(org.registrationIdentifier).schemeIdentifier).toBe('0009');
    expect(obj(seller.taxRegistration).vatIdentifier).toBe('FR40812345678');
    expect(obj(agreement.buyer).name).toBe('Client Pro SAS');
  });
  it('ventilation TVA standard (catégorie S)', () => {
    const vb = arr(settlement.vatBreakdown);
    expect(vb).toHaveLength(1);
    expect(obj(vb[0]).categoryCode).toBe('S');
    expect(obj(vb[0]).basisAmount).toBe(1000);
    expect(obj(vb[0]).calculatedAmount).toBe(200);
  });
  it('totaux : base, TVA, TTC, dû', () => {
    expect(sommation.taxBasisTotalAmount).toBe(1000);
    expect(obj(sommation.taxTotal).amount).toBe(200);
    expect(sommation.grandTotalAmount).toBe(1200);
    expect(sommation.duePayableAmount).toBe(1200);
  });
  it('moyen de paiement = virement avec IBAN', () => {
    const pi = obj(settlement.paymentInstruction);
    expect(pi.typeCode).toBe('30');
    expect(obj(arr(pi.transfers)[0]).paymentAccountIdentifier).toBe(
      'FR7630006000011234567890189',
    );
  });
});

describe('construireDocumentFacturX — auto-liquidation', () => {
  const doc = construireDocumentFacturX(
    modeleBase({ autoLiquidation: true, totalTva: 0, totalTtc: 1000, tva: [{ taux: 20, base: 1000, montant: 0 }] }),
  );
  const tx = obj(doc.transaction);
  const settlement = obj(tx.tradeSettlement);

  it('catégorie AE et taux 0 sur la ligne', () => {
    const ligne = obj(arr(tx.line)[0]);
    const tradeTax = obj(obj(ligne.tradeSettlement).tradeTax);
    expect(tradeTax.categoryCode).toBe('AE');
    expect(tradeTax.rateApplicablePercent).toBe(0);
  });
  it('ventilation AE : TVA calculée 0 + motif d’exonération', () => {
    const vb = obj(arr(settlement.vatBreakdown)[0]);
    expect(vb.categoryCode).toBe('AE');
    expect(vb.calculatedAmount).toBe(0);
    expect(String(vb.exemptionReasonText)).toContain('Autoliquidation');
  });
  it('note d’auto-liquidation présente', () => {
    const notes = arr(doc.includedNote);
    expect(notes.some((n) => String(obj(n).content).includes('283-2 nonies'))).toBe(true);
  });
});

describe('construireDocumentFacturX — remise globale', () => {
  // brut 1250 → net 1000 (remise 250). TVA 20 % sur 1000 = 200.
  const doc = construireDocumentFacturX(
    modeleBase({
      remiseGlobaleMontant: 250,
      lignes: [
        {
          estSection: false,
          designation: 'Prestation',
          articleCode: null,
          quantite: 1,
          unite: 'U',
          prixUnitaireHt: 1250,
          montantHt: 1250,
          tauxTva: 20,
        },
      ],
      tva: [{ taux: 20, base: 1000, montant: 200 }],
    }),
  );
  const settlement = obj(obj(doc.transaction).tradeSettlement);
  const sommation = obj(settlement.monetarySummation);

  it('allègement document ventilé = remise', () => {
    const allowances = arr(settlement.allowances);
    expect(allowances).toHaveLength(1);
    expect(obj(allowances[0]).actualAmount).toBe(250);
    expect(obj(allowances[0]).chargeIndicator).toBe(false);
  });
  it('lineTotal brut, allowanceTotal et base nette cohérents (BR-CO-13)', () => {
    expect(sommation.lineTotalAmount).toBe(1250);
    expect(sommation.allowanceTotalAmount).toBe(250);
    expect(sommation.taxBasisTotalAmount).toBe(1000);
  });
});

describe('construireDocumentFacturX — retenue de garantie', () => {
  const doc = construireDocumentFacturX(modeleBase({ retenueGarantieMontant: 60 }));
  const settlement = obj(obj(doc.transaction).tradeSettlement);
  const sommation = obj(settlement.monetarySummation);

  it('le montant dû reste le TTC (retenue en conditions de paiement, BR-CO-16)', () => {
    expect(sommation.grandTotalAmount).toBe(1200);
    expect(sommation.duePayableAmount).toBe(1200);
    expect(String(obj(settlement.paymentTerms).description)).toContain('Retenue de garantie');
  });
});
