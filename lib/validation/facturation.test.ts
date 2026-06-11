import { describe, expect, it } from 'vitest';

import {
  factureSchema,
  ligneFactureSchema,
  ligneSituationSchema,
  situationTravauxSchema,
} from './facturation';

const UUID_CLIENT = '00000000-0000-4000-8000-000000000001';
const UUID_ARTICLE = '00000000-0000-4000-8000-000000000002';
const UUID_CHANTIER = '00000000-0000-4000-8000-000000000003';

// ─────────────────────────────────────────────────────────────
// ligneFactureSchema (section / article_catalogue / libre)
// ─────────────────────────────────────────────────────────────

describe('ligneFactureSchema', () => {
  it('accepte une section avec uniquement la désignation', () => {
    const r = ligneFactureSchema.parse({
      type: 'section',
      designation: 'Lot 1 — Gros œuvre',
    });
    expect(r.type).toBe('section');
    expect(r.designation).toBe('Lot 1 — Gros œuvre');
  });

  it('accepte une ligne libre complète', () => {
    const r = ligneFactureSchema.parse({
      type: 'libre',
      designation: 'Sable 0/4',
      quantite: 5,
      unite: 't',
      prixUnitaireHt: '45.50',
      tauxTva: '20',
      remisePourcent: '0',
    });
    expect(r.type).toBe('libre');
    expect(r.quantite).toBe('5.0000');
    expect(r.prixUnitaireHt).toBe('45.50');
    expect(r.tauxTva).toBe('20.00');
  });

  it('accepte une ligne article catalogue (articleId requis)', () => {
    const r = ligneFactureSchema.parse({
      type: 'article_catalogue',
      articleId: UUID_ARTICLE,
      designation: 'Béton C25',
      quantite: '1,5',
      unite: 'm3',
      prixUnitaireHt: '120',
      tauxTva: '20',
    });
    expect(r.type).toBe('article_catalogue');
    expect(r.articleId).toBe(UUID_ARTICLE);
    // Virgule décimale acceptée
    expect(r.quantite).toBe('1.5000');
  });

  it('refuse une ligne article sans articleId', () => {
    expect(() =>
      ligneFactureSchema.parse({
        type: 'article_catalogue',
        articleId: 'pas-uuid',
        designation: 'X',
        quantite: 1,
        unite: 'u',
        prixUnitaireHt: '100',
        tauxTva: '20',
      }),
    ).toThrow(/Article catalogue invalide/);
  });

  it('refuse un taux TVA > 100', () => {
    expect(() =>
      ligneFactureSchema.parse({
        type: 'libre',
        designation: 'X',
        quantite: 1,
        unite: 'u',
        prixUnitaireHt: '100',
        tauxTva: '120',
      }),
    ).toThrow(/Taux TVA/);
  });

  it('refuse une quantité ≤ 0', () => {
    expect(() =>
      ligneFactureSchema.parse({
        type: 'libre',
        designation: 'X',
        quantite: 0,
        unite: 'u',
        prixUnitaireHt: '100',
        tauxTva: '20',
      }),
    ).toThrow(/Quantité/);
  });

  it('refuse un prix unitaire négatif', () => {
    expect(() =>
      ligneFactureSchema.parse({
        type: 'libre',
        designation: 'X',
        quantite: 1,
        unite: 'u',
        prixUnitaireHt: '-10',
        tauxTva: '20',
      }),
    ).toThrow(/Prix unitaire/);
  });
});

// ─────────────────────────────────────────────────────────────
// factureSchema (en-tête)
// ─────────────────────────────────────────────────────────────

describe('factureSchema', () => {
  const factureMinimale = {
    clientId: UUID_CLIENT,
    dateFacture: '2026-05-24',
    lignes: [
      {
        type: 'libre' as const,
        designation: 'Prestation',
        quantite: 1,
        unite: 'forfait',
        prixUnitaireHt: '1000',
        tauxTva: '20',
      },
    ],
  };

  it('accepte une facture directe minimale', () => {
    const r = factureSchema.parse(factureMinimale);
    expect(r.clientId).toBe(UUID_CLIENT);
    expect(r.lignes).toHaveLength(1);
    expect(r.autoLiquidation).toBe(false);
    expect(r.retenueGarantiePct).toBeNull();
  });

  it('refuse une facture sans ligne', () => {
    expect(() => factureSchema.parse({ ...factureMinimale, lignes: [] })).toThrow(
      /Au moins une ligne/,
    );
  });

  it('refuse un retenue garantie > 10 %', () => {
    expect(() => factureSchema.parse({ ...factureMinimale, retenueGarantiePct: '15' })).toThrow(
      /Retenue garantie/,
    );
  });

  it('accepte une retenue de 5 %', () => {
    const r = factureSchema.parse({ ...factureMinimale, retenueGarantiePct: '5' });
    expect(r.retenueGarantiePct).toBe('5.00');
  });

  it('accepte auto-liquidation et délai paiement', () => {
    const r = factureSchema.parse({
      ...factureMinimale,
      autoLiquidation: true,
      delaiPaiementJours: 30,
    });
    expect(r.autoLiquidation).toBe(true);
    expect(r.delaiPaiementJours).toBe(30);
  });

  it('refuse un délai de paiement > 365 jours', () => {
    expect(() => factureSchema.parse({ ...factureMinimale, delaiPaiementJours: 400 })).toThrow(
      /Délai paiement/,
    );
  });

  it('accepte un chantier et un devis liés (UUIDs optionnels)', () => {
    const r = factureSchema.parse({
      ...factureMinimale,
      chantierId: UUID_CHANTIER,
      devisId: '00000000-0000-4000-8000-000000000099',
    });
    expect(r.chantierId).toBe(UUID_CHANTIER);
    expect(r.devisId).toBe('00000000-0000-4000-8000-000000000099');
  });
});

// ─────────────────────────────────────────────────────────────
// ligneSituationSchema (mode hybride : montant OU qty × PU)
// ─────────────────────────────────────────────────────────────

describe('ligneSituationSchema', () => {
  it('accepte une ligne avec montant direct + %', () => {
    const r = ligneSituationSchema.parse({
      designation: 'Maçonnerie',
      montantMarcheHt: '15000',
      pctAvancementCumule: '60',
    });
    expect(r.montantMarcheHt).toBe('15000.00');
    expect(r.pctAvancementCumule).toBe('60.00');
  });

  it('accepte une ligne avec qty × PU + %', () => {
    const r = ligneSituationSchema.parse({
      designation: 'Béton C25',
      quantite: 10,
      unite: 'm3',
      prixUnitaireHt: '120',
      pctAvancementCumule: '50',
    });
    expect(r.quantite).toBe('10.0000');
    expect(r.prixUnitaireHt).toBe('120.00');
  });

  it('refuse une ligne sans aucun montant exploitable', () => {
    expect(() =>
      ligneSituationSchema.parse({
        designation: 'X',
        pctAvancementCumule: '50',
      }),
    ).toThrow(/montant marché HT, soit une quantité/);
  });

  it('refuse une ligne avec seulement quantité (PU manquant)', () => {
    expect(() =>
      ligneSituationSchema.parse({
        designation: 'X',
        quantite: 5,
        pctAvancementCumule: '50',
      }),
    ).toThrow(/montant marché HT, soit une quantité/);
  });

  it('accepte % à 0 (poste pas encore commencé)', () => {
    const r = ligneSituationSchema.parse({
      designation: 'X',
      montantMarcheHt: '1000',
      pctAvancementCumule: '0',
    });
    expect(r.pctAvancementCumule).toBe('0.00');
  });

  it('accepte % à 100 (poste terminé)', () => {
    const r = ligneSituationSchema.parse({
      designation: 'X',
      montantMarcheHt: '1000',
      pctAvancementCumule: '100',
    });
    expect(r.pctAvancementCumule).toBe('100.00');
  });

  it('refuse un % > 100', () => {
    expect(() =>
      ligneSituationSchema.parse({
        designation: 'X',
        montantMarcheHt: '1000',
        pctAvancementCumule: '110',
      }),
    ).toThrow(/entre 0 et 100/);
  });

  it('refuse un % négatif', () => {
    expect(() =>
      ligneSituationSchema.parse({
        designation: 'X',
        montantMarcheHt: '1000',
        pctAvancementCumule: '-5',
      }),
    ).toThrow(/entre 0 et 100/);
  });
});

// ─────────────────────────────────────────────────────────────
// situationTravauxSchema (en-tête + lignes)
// ─────────────────────────────────────────────────────────────

describe('situationTravauxSchema', () => {
  it('accepte une situation valide avec 1 ligne', () => {
    const r = situationTravauxSchema.parse({
      chantierId: UUID_CHANTIER,
      dateSituation: '2026-05-24',
      tauxTva: '20',
      lignes: [
        {
          designation: 'Lot 1',
          montantMarcheHt: '50000',
          pctAvancementCumule: '40',
        },
      ],
    });
    expect(r.chantierId).toBe(UUID_CHANTIER);
    expect(r.lignes).toHaveLength(1);
    expect(r.tauxTva).toBe('20.00');
  });

  it('refuse une situation sans ligne', () => {
    expect(() =>
      situationTravauxSchema.parse({
        chantierId: UUID_CHANTIER,
        dateSituation: '2026-05-24',
        lignes: [],
      }),
    ).toThrow(/Au moins une ligne/);
  });

  it('défaut taux TVA = 20 %', () => {
    const r = situationTravauxSchema.parse({
      chantierId: UUID_CHANTIER,
      dateSituation: '2026-05-24',
      lignes: [{ designation: 'X', montantMarcheHt: '1000', pctAvancementCumule: '50' }],
    });
    expect(r.tauxTva).toBe('20.00');
  });

  it('accepte un devisId optionnel', () => {
    const r = situationTravauxSchema.parse({
      chantierId: UUID_CHANTIER,
      devisId: '00000000-0000-4000-8000-000000000099',
      dateSituation: '2026-05-24',
      lignes: [{ designation: 'X', montantMarcheHt: '1000', pctAvancementCumule: '50' }],
    });
    expect(r.devisId).toBe('00000000-0000-4000-8000-000000000099');
  });

  it('refuse un format de date invalide', () => {
    expect(() =>
      situationTravauxSchema.parse({
        chantierId: UUID_CHANTIER,
        dateSituation: '24/05/2026',
        lignes: [{ designation: 'X', montantMarcheHt: '1000', pctAvancementCumule: '50' }],
      }),
    ).toThrow(/Date invalide/);
  });

  it('accepte plusieurs lignes', () => {
    const r = situationTravauxSchema.parse({
      chantierId: UUID_CHANTIER,
      dateSituation: '2026-05-24',
      lignes: [
        { designation: 'Lot 1', montantMarcheHt: '10000', pctAvancementCumule: '50' },
        {
          designation: 'Lot 2',
          quantite: 5,
          prixUnitaireHt: '200',
          unite: 'u',
          pctAvancementCumule: '30',
        },
      ],
    });
    expect(r.lignes).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────
// Remise globale (facture + situation)
// ─────────────────────────────────────────────────────────────

describe('remise globale', () => {
  const factureBase = {
    clientId: UUID_CLIENT,
    dateFacture: '2026-05-24',
    lignes: [
      {
        type: 'libre' as const,
        designation: 'Prestation',
        quantite: 1,
        unite: 'forfait',
        prixUnitaireHt: '1000',
        tauxTva: '20',
      },
    ],
  };
  const situationBase = {
    chantierId: UUID_CHANTIER,
    dateSituation: '2026-05-24',
    lignes: [{ designation: 'Lot 1', montantMarcheHt: '50000', pctAvancementCumule: '40' }],
  };

  it('facture : pas de remise par défaut', () => {
    const r = factureSchema.parse(factureBase);
    expect(r.remiseGlobaleType).toBeNull();
    expect(r.remiseGlobaleValeur).toBeNull();
  });

  it('facture : accepte une remise en montant', () => {
    const r = factureSchema.parse({
      ...factureBase,
      remiseGlobaleType: 'montant',
      remiseGlobaleValeur: '150',
    });
    expect(r.remiseGlobaleType).toBe('montant');
    expect(r.remiseGlobaleValeur).toBe('150.00');
  });

  it('facture : rejette un type sans valeur', () => {
    expect(() => factureSchema.parse({ ...factureBase, remiseGlobaleType: 'pourcent' })).toThrow(
      /montant de remise/,
    );
  });

  it('facture : rejette un pourcentage > 100', () => {
    expect(() =>
      factureSchema.parse({
        ...factureBase,
        remiseGlobaleType: 'pourcent',
        remiseGlobaleValeur: '120',
      }),
    ).toThrow(/100/);
  });

  it('situation : accepte une remise en pourcentage', () => {
    const r = situationTravauxSchema.parse({
      ...situationBase,
      remiseGlobaleType: 'pourcent',
      remiseGlobaleValeur: '5',
    });
    expect(r.remiseGlobaleType).toBe('pourcent');
    expect(r.remiseGlobaleValeur).toBe('5.00');
  });

  it('situation : rejette un type sans valeur', () => {
    expect(() =>
      situationTravauxSchema.parse({
        ...situationBase,
        remiseGlobaleType: 'montant',
      }),
    ).toThrow(/montant de remise/);
  });
});
