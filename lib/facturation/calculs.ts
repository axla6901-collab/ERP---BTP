import type { LigneFactureInput, LigneSituationInput } from '@/lib/validation/facturation';

/**
 * Calculs facturation — version pure (testable côté serveur ET client).
 *
 * Réutilise la même logique que devis pour les lignes (cohérence métier),
 * avec en plus :
 *   - calculerTotauxFacture qui gère l'auto-liquidation (force TVA=0)
 *   - calculerMontantRetenue (pour retenue de garantie)
 *   - calculerDeltaSituation (situations cumulées : delta = cumulé - précédent)
 */

export function calculerMontantLigneFacture(ligne: LigneFactureInput): {
  montantHt: string | null;
  montantTva: string | null;
  montantTtc: string | null;
} {
  if (ligne.type === 'section') {
    return { montantHt: null, montantTva: null, montantTtc: null };
  }

  const qty = Number(ligne.quantite);
  const pu = Number(ligne.prixUnitaireHt);
  const remise = Number(ligne.remisePourcent ?? '0');
  const tauxTva = Number(ligne.tauxTva);

  const brutHt = qty * pu;
  const ht = brutHt * (1 - remise / 100);
  const tva = ht * (tauxTva / 100);
  const ttc = ht + tva;

  return {
    montantHt: ht.toFixed(2),
    montantTva: tva.toFixed(2),
    montantTtc: ttc.toFixed(2),
  };
}

export type DetailsTva = Record<string, { base: string; tva: string }>;

/**
 * Totaux d'une facture.
 *
 * Si `autoLiquidation = true` : la TVA est forcée à 0 (le preneur de travaux
 * la collecte). Les `detailsTva` restent renseignés pour traçabilité (base
 * imposable par taux), mais avec `tva: "0.00"`.
 */
export function calculerTotauxFacture(
  lignes: LigneFactureInput[],
  options: { autoLiquidation?: boolean } = {},
): {
  totalHt: string;
  totalTva: string;
  totalTtc: string;
  detailsTva: DetailsTva;
} {
  const autoLiq = options.autoLiquidation ?? false;

  let totalHt = 0;
  let totalTva = 0;
  const details = new Map<string, { base: number; tva: number }>();

  for (const ligne of lignes) {
    if (ligne.type === 'section') continue;
    const m = calculerMontantLigneFacture(ligne);
    if (m.montantHt === null || m.montantTva === null) continue;

    const ht = Number(m.montantHt);
    const tvaLigne = autoLiq ? 0 : Number(m.montantTva);
    totalHt += ht;
    totalTva += tvaLigne;

    const taux = ligne.tauxTva as string;
    const current = details.get(taux) ?? { base: 0, tva: 0 };
    details.set(taux, { base: current.base + ht, tva: current.tva + tvaLigne });
  }

  const detailsTva: DetailsTva = {};
  for (const [taux, { base, tva }] of details.entries()) {
    detailsTva[taux] = { base: base.toFixed(2), tva: tva.toFixed(2) };
  }

  return {
    totalHt: totalHt.toFixed(2),
    totalTva: totalTva.toFixed(2),
    totalTtc: (totalHt + totalTva).toFixed(2),
    detailsTva,
  };
}

/**
 * Calcule le montant de retenue de garantie depuis un total HT et un %.
 * Retenue = totalHt × pct / 100.
 */
export function calculerMontantRetenue(
  totalHt: string | number,
  retenuePct: string | number | null,
): string | null {
  if (retenuePct == null || retenuePct === '') return null;
  const ht = Number(totalHt);
  const pct = Number(retenuePct);
  if (!Number.isFinite(ht) || !Number.isFinite(pct) || pct <= 0) return null;
  return ((ht * pct) / 100).toFixed(2);
}

/**
 * Calcul du delta à facturer pour une situation cumulée (modèle simple,
 * 1 % global). Conservé pour rétrocompatibilité et tests.
 *
 *   montantCumule        = montantMarche × pct / 100
 *   montantAFacturer     = montantCumule - montantPrecedent
 */
export function calculerDeltaSituation(input: {
  montantMarcheHt: string | number;
  pctAvancementCumule: string | number;
  montantSituationPrecedenteHt: string | number;
}): {
  montantCumuleHt: string;
  montantAFacturerHt: string;
} {
  const marche = Number(input.montantMarcheHt);
  const pct = Number(input.pctAvancementCumule);
  const precedent = Number(input.montantSituationPrecedenteHt);
  const cumule = (marche * pct) / 100;
  const aFacturer = cumule - precedent;
  return {
    montantCumuleHt: cumule.toFixed(2),
    montantAFacturerHt: aFacturer.toFixed(2),
  };
}

/**
 * Résout le montant marché HT d'une ligne en mode hybride :
 *   - si `montantMarcheHt` est saisi → on l'utilise tel quel (prime)
 *   - sinon → calcul qty × PU
 *   - retourne null si aucun mode n'a été saisi
 */
export function resoudreMontantMarcheLigne(
  ligne: Pick<LigneSituationInput, 'montantMarcheHt' | 'quantite' | 'prixUnitaireHt'>,
): string | null {
  if (ligne.montantMarcheHt != null && ligne.montantMarcheHt !== '') {
    return Number(ligne.montantMarcheHt).toFixed(2);
  }
  if (
    ligne.quantite != null &&
    ligne.quantite !== '' &&
    ligne.prixUnitaireHt != null &&
    ligne.prixUnitaireHt !== ''
  ) {
    const m = Number(ligne.quantite) * Number(ligne.prixUnitaireHt);
    if (Number.isFinite(m)) return m.toFixed(2);
  }
  return null;
}

/**
 * Calcule les montants figés d'une ligne de situation (marché, cumulé, à
 * facturer). `montantSituationPrecedenteHt` vient de la ligne équivalente
 * de la situation précédente (ou 0 pour la 1ère situation).
 */
export function calculerLigneSituation(
  ligne: LigneSituationInput,
  precedentCumuleHt: string | number = 0,
): {
  montantMarcheHt: string;
  montantCumuleHt: string;
  montantSituationPrecedenteHt: string;
  montantAFacturerHt: string;
} | null {
  const marche = resoudreMontantMarcheLigne(ligne);
  if (marche == null) return null;
  const pct = Number(ligne.pctAvancementCumule);
  const marcheNum = Number(marche);
  const precedent = Number(precedentCumuleHt);
  const cumule = (marcheNum * pct) / 100;
  const aFacturer = cumule - precedent;
  return {
    montantMarcheHt: marche,
    montantCumuleHt: cumule.toFixed(2),
    montantSituationPrecedenteHt: precedent.toFixed(2),
    montantAFacturerHt: aFacturer.toFixed(2),
  };
}

/**
 * Agrège les totaux d'une situation à partir de ses lignes hydratées
 * (montants déjà figés). Sert au cache `situations_travaux.{marche,cumule,
 * precedent,aFacturer,pctGlobal}` et à l'affichage.
 *
 * `pctGlobal` = moyenne pondérée des % par les montants marché.
 */
export function calculerTotauxSituation(
  lignes: Array<{
    montantMarcheHt: string | number;
    montantCumuleHt: string | number;
    montantSituationPrecedenteHt: string | number;
    montantAFacturerHt: string | number;
  }>,
): {
  montantMarcheHt: string;
  montantCumuleHt: string;
  montantSituationPrecedenteHt: string;
  montantAFacturerHt: string;
  pctAvancementCumule: string;
} {
  let marche = 0;
  let cumule = 0;
  let precedent = 0;
  let aFacturer = 0;
  for (const l of lignes) {
    marche += Number(l.montantMarcheHt);
    cumule += Number(l.montantCumuleHt);
    precedent += Number(l.montantSituationPrecedenteHt);
    aFacturer += Number(l.montantAFacturerHt);
  }
  const pct = marche > 0 ? (cumule / marche) * 100 : 0;
  return {
    montantMarcheHt: marche.toFixed(2),
    montantCumuleHt: cumule.toFixed(2),
    montantSituationPrecedenteHt: precedent.toFixed(2),
    montantAFacturerHt: aFacturer.toFixed(2),
    pctAvancementCumule: pct.toFixed(2),
  };
}
