import { describe, expect, it } from 'vitest';

import {
  calculerDeltaSituation,
  calculerLigneSituation,
  calculerMontantRetenue,
  calculerTotauxFacture,
  calculerTotauxSituation,
  resoudreMontantMarcheLigne,
} from './calculs';
import type {
  LigneFactureInput,
  LigneSituationInput,
} from '@/lib/validation/facturation';

const ligneLibre = (q: number, pu: number, tva = 20): LigneFactureInput => ({
  type: 'libre',
  articleId: null,
  designation: 'Test',
  quantite: q.toFixed(4),
  unite: 'u',
  prixUnitaireHt: pu.toFixed(2),
  tauxTva: tva.toFixed(2),
  remisePourcent: '0',
  notes: null,
});

describe('calculerTotauxFacture', () => {
  it('somme HT + TVA + TTC sur plusieurs lignes', () => {
    const r = calculerTotauxFacture([ligneLibre(2, 100), ligneLibre(1, 50, 10)]);
    expect(r.totalHt).toBe('250.00');
    expect(r.totalTva).toBe('45.00'); // (200 * 0.20) + (50 * 0.10) = 40 + 5
    expect(r.totalTtc).toBe('295.00');
    expect(r.detailsTva['20.00']).toEqual({ base: '200.00', tva: '40.00' });
    expect(r.detailsTva['10.00']).toEqual({ base: '50.00', tva: '5.00' });
  });

  it('auto-liquidation : TVA forcée à 0', () => {
    const r = calculerTotauxFacture([ligneLibre(10, 50)], { autoLiquidation: true });
    expect(r.totalHt).toBe('500.00');
    expect(r.totalTva).toBe('0.00');
    expect(r.totalTtc).toBe('500.00');
    // base imposable conservée pour traçabilité
    expect(r.detailsTva['20.00']).toEqual({ base: '500.00', tva: '0.00' });
  });

  it('ignore les sections', () => {
    const r = calculerTotauxFacture([
      {
        type: 'section',
        designation: 'Lot 1',
        articleId: null,
        quantite: null,
        unite: null,
        prixUnitaireHt: null,
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      },
      ligneLibre(1, 100),
    ]);
    expect(r.totalHt).toBe('100.00');
  });
});

describe('calculerMontantRetenue', () => {
  it('calcule la retenue à partir d’un HT et d’un %', () => {
    expect(calculerMontantRetenue('10000.00', '5')).toBe('500.00');
    expect(calculerMontantRetenue(2000, '2.50')).toBe('50.00');
  });

  it('renvoie null si % manquant ou nul', () => {
    expect(calculerMontantRetenue('1000', null)).toBeNull();
    expect(calculerMontantRetenue('1000', '0')).toBeNull();
    expect(calculerMontantRetenue('1000', '')).toBeNull();
  });
});

describe('calculerDeltaSituation', () => {
  it('1ère situation : cumulé = marché × pct, delta = cumulé', () => {
    const r = calculerDeltaSituation({
      montantMarcheHt: '100000',
      pctAvancementCumule: '30',
      montantSituationPrecedenteHt: '0',
    });
    expect(r.montantCumuleHt).toBe('30000.00');
    expect(r.montantAFacturerHt).toBe('30000.00');
  });

  it('situation suivante : delta = nouveau cumulé - précédent', () => {
    const r = calculerDeltaSituation({
      montantMarcheHt: '100000',
      pctAvancementCumule: '50',
      montantSituationPrecedenteHt: '30000',
    });
    expect(r.montantCumuleHt).toBe('50000.00');
    expect(r.montantAFacturerHt).toBe('20000.00');
  });

  it('% à 100 = solde final', () => {
    const r = calculerDeltaSituation({
      montantMarcheHt: 100000,
      pctAvancementCumule: 100,
      montantSituationPrecedenteHt: 80000,
    });
    expect(r.montantCumuleHt).toBe('100000.00');
    expect(r.montantAFacturerHt).toBe('20000.00');
  });
});

// ─────────────────────────────────────────────────────────────
// Lignes de situation (modèle hybride)
// ─────────────────────────────────────────────────────────────

const ligneSit = (overrides: Partial<LigneSituationInput> = {}): LigneSituationInput => ({
  designation: 'Poste test',
  articleId: null,
  quantite: null,
  unite: null,
  prixUnitaireHt: null,
  montantMarcheHt: null,
  pctAvancementCumule: '0',
  notes: null,
  lignePrecedenteId: null,
  ...overrides,
});

describe('resoudreMontantMarcheLigne', () => {
  it('utilise montantMarcheHt direct si fourni', () => {
    const r = resoudreMontantMarcheLigne(
      ligneSit({ montantMarcheHt: '1500', quantite: '10', prixUnitaireHt: '200' }),
    );
    // montant direct prime sur qty × PU même si les deux sont saisis
    expect(r).toBe('1500.00');
  });

  it('calcule qty × PU si pas de montant direct', () => {
    const r = resoudreMontantMarcheLigne(
      ligneSit({ quantite: '12.5', prixUnitaireHt: '40' }),
    );
    expect(r).toBe('500.00');
  });

  it('retourne null si rien n’est exploitable', () => {
    expect(resoudreMontantMarcheLigne(ligneSit())).toBeNull();
    expect(resoudreMontantMarcheLigne(ligneSit({ quantite: '5' }))).toBeNull();
    expect(resoudreMontantMarcheLigne(ligneSit({ prixUnitaireHt: '100' }))).toBeNull();
  });

  it('ignore les chaînes vides', () => {
    const r = resoudreMontantMarcheLigne(
      ligneSit({ montantMarcheHt: '', quantite: '2', prixUnitaireHt: '100' }),
    );
    expect(r).toBe('200.00');
  });
});

describe('calculerLigneSituation', () => {
  it('1ère situation (pas de précédent) : delta = cumulé', () => {
    const r = calculerLigneSituation(
      ligneSit({ montantMarcheHt: '10000', pctAvancementCumule: '40' }),
    );
    expect(r).not.toBeNull();
    expect(r!.montantMarcheHt).toBe('10000.00');
    expect(r!.montantCumuleHt).toBe('4000.00');
    expect(r!.montantSituationPrecedenteHt).toBe('0.00');
    expect(r!.montantAFacturerHt).toBe('4000.00');
  });

  it('situation suivante : delta = nouveau cumulé - précédent', () => {
    const r = calculerLigneSituation(
      ligneSit({ montantMarcheHt: '10000', pctAvancementCumule: '70' }),
      '4000', // précédent cumulé
    );
    expect(r!.montantCumuleHt).toBe('7000.00');
    expect(r!.montantSituationPrecedenteHt).toBe('4000.00');
    expect(r!.montantAFacturerHt).toBe('3000.00');
  });

  it('mode qty × PU', () => {
    const r = calculerLigneSituation(
      ligneSit({ quantite: '5', prixUnitaireHt: '120', pctAvancementCumule: '50' }),
    );
    expect(r!.montantMarcheHt).toBe('600.00');
    expect(r!.montantCumuleHt).toBe('300.00');
    expect(r!.montantAFacturerHt).toBe('300.00');
  });

  it('% à 0 : ligne valide mais rien à facturer', () => {
    const r = calculerLigneSituation(
      ligneSit({ montantMarcheHt: '5000', pctAvancementCumule: '0' }),
    );
    expect(r!.montantCumuleHt).toBe('0.00');
    expect(r!.montantAFacturerHt).toBe('0.00');
  });

  it('retourne null si aucun montant exploitable', () => {
    expect(
      calculerLigneSituation(ligneSit({ pctAvancementCumule: '50' })),
    ).toBeNull();
  });

  it('delta négatif possible si % saisi < cumulé précédent (à attraper au niveau Server Action)', () => {
    // La fonction de calcul ne refuse pas — c'est la Server Action qui rejette.
    const r = calculerLigneSituation(
      ligneSit({ montantMarcheHt: '10000', pctAvancementCumule: '30' }),
      '4000',
    );
    expect(r!.montantAFacturerHt).toBe('-1000.00');
  });
});

describe('calculerTotauxSituation', () => {
  it('agrège marché / cumulé / précédent / à facturer ; % global pondéré', () => {
    const r = calculerTotauxSituation([
      {
        montantMarcheHt: '10000',
        montantCumuleHt: '4000',
        montantSituationPrecedenteHt: '0',
        montantAFacturerHt: '4000',
      },
      {
        montantMarcheHt: '20000',
        montantCumuleHt: '15000',
        montantSituationPrecedenteHt: '5000',
        montantAFacturerHt: '10000',
      },
    ]);
    expect(r.montantMarcheHt).toBe('30000.00');
    expect(r.montantCumuleHt).toBe('19000.00');
    expect(r.montantSituationPrecedenteHt).toBe('5000.00');
    expect(r.montantAFacturerHt).toBe('14000.00');
    // pct = 19000 / 30000 = 63.333…
    expect(r.pctAvancementCumule).toBe('63.33');
  });

  it('tableau vide : tous zéros, pct = 0', () => {
    const r = calculerTotauxSituation([]);
    expect(r.montantMarcheHt).toBe('0.00');
    expect(r.pctAvancementCumule).toBe('0.00');
  });

  it('marché nul : pct global forcé à 0 (pas division par zéro)', () => {
    const r = calculerTotauxSituation([
      {
        montantMarcheHt: '0',
        montantCumuleHt: '0',
        montantSituationPrecedenteHt: '0',
        montantAFacturerHt: '0',
      },
    ]);
    expect(r.pctAvancementCumule).toBe('0.00');
  });

  it('accepte les valeurs numériques comme strings ou nombres', () => {
    const r = calculerTotauxSituation([
      {
        montantMarcheHt: 5000,
        montantCumuleHt: 2500,
        montantSituationPrecedenteHt: 1000,
        montantAFacturerHt: 1500,
      },
    ]);
    expect(r.montantMarcheHt).toBe('5000.00');
    expect(r.pctAvancementCumule).toBe('50.00');
  });
});
