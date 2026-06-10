import { z } from 'zod';

/**
 * Remise globale d'un document (devis, facture, situation) appliquée
 * **directement sur le total HT**, par opposition aux remises par ligne
 * (`remisePourcent`) qui sont déjà fondues dans les montants de chaque ligne.
 *
 * Deux modes :
 *   - `pourcent` : pourcentage du total HT (0 à 100).
 *   - `montant`  : montant fixe en euros, plafonné au total HT.
 *
 * `type === null` ⇒ aucune remise globale (la valeur est ignorée).
 *
 * La remise est ventilée **proportionnellement** sur chaque tranche de TVA
 * (cf. [[appliquerRemiseGlobale]]) afin que la TVA par taux reste correcte —
 * exigence comptable d'une facture multi-taux.
 */

export type RemiseGlobaleType = 'pourcent' | 'montant';

export type RemiseGlobale = {
  type: RemiseGlobaleType | null;
  valeur: string | null;
};

export type DetailsTva = Record<string, { base: string; tva: string }>;

export type TotauxHt = {
  totalHt: string;
  totalTva: string;
  totalTtc: string;
  detailsTva: DetailsTva;
};

export type TotauxAvecRemise = TotauxHt & {
  /** Total HT avant remise globale (= ancien `totalHt`). */
  totalHtAvantRemise: string;
  /** Montant effectivement remisé (≥ 0), tel que totalHtAvantRemise − montant = totalHt. */
  remiseGlobaleMontant: string;
};

/**
 * Montant remisé pour un total HT brut donné. Renvoie 0 si la remise est
 * absente, nulle ou négative. Un montant fixe est plafonné au total HT (on ne
 * descend jamais sous 0) ; un pourcentage est borné à 100 %.
 */
export function calculerMontantRemiseGlobale(
  totalHtBrut: number,
  remise: RemiseGlobale,
): number {
  if (!remise.type || remise.valeur == null || remise.valeur === '') return 0;
  if (!Number.isFinite(totalHtBrut) || totalHtBrut <= 0) return 0;
  const v = Number(remise.valeur);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (remise.type === 'pourcent') {
    const pct = Math.min(v, 100);
    return totalHtBrut * (pct / 100);
  }
  return Math.min(v, totalHtBrut);
}

/**
 * Applique une remise globale à des totaux déjà ventilés par taux de TVA.
 *
 * Le montant remisé est réparti au prorata de chaque base HT : pour la tranche
 * de taux `t`, `base_net = base × (1 − ratio)` et `tva_net = tva × (1 − ratio)`
 * (on met la TVA à l'échelle plutôt que de la recalculer, ce qui préserve
 * l'auto-liquidation où `tva = 0`).
 *
 * Les bases/TVA nettes sont arrondies au centime puis re-sommées, garantissant
 * que `totalHt === Σ base_net` et que `totalHtAvantRemise − remiseGlobaleMontant
 * === totalHt` à l'affichage.
 */
export function appliquerRemiseGlobale(
  totaux: TotauxHt,
  remise: RemiseGlobale,
): TotauxAvecRemise {
  const brut = Number(totaux.totalHt);
  const montant = calculerMontantRemiseGlobale(brut, remise);

  if (montant <= 0) {
    return {
      ...totaux,
      totalHtAvantRemise: brut.toFixed(2),
      remiseGlobaleMontant: '0.00',
    };
  }

  const ratio = montant / brut;
  let netHt = 0;
  let netTva = 0;
  const detailsTva: DetailsTva = {};
  for (const [taux, d] of Object.entries(totaux.detailsTva)) {
    const baseNet = Number((Number(d.base) * (1 - ratio)).toFixed(2));
    const tvaNet = Number((Number(d.tva) * (1 - ratio)).toFixed(2));
    detailsTva[taux] = { base: baseNet.toFixed(2), tva: tvaNet.toFixed(2) };
    netHt += baseNet;
    netTva += tvaNet;
  }

  return {
    totalHt: netHt.toFixed(2),
    totalTva: netTva.toFixed(2),
    totalTtc: (netHt + netTva).toFixed(2),
    detailsTva,
    totalHtAvantRemise: brut.toFixed(2),
    // Recalculé depuis les bases nettes arrondies pour rester exactement
    // cohérent avec `totalHt` (évite un écart d'un centime à l'affichage).
    remiseGlobaleMontant: (brut - netHt).toFixed(2),
  };
}

/** Libellé court de la remise pour l'affichage (« 5 % » ou « forfait »). */
export function libelleRemiseGlobale(remise: RemiseGlobale): string {
  if (remise.type === 'pourcent' && remise.valeur != null) {
    return `${Number(remise.valeur).toFixed(2).replace(/\.?0+$/, '')} %`;
  }
  return 'forfait';
}

// ─────────────────────────────────────────────────────────────
// Fragments Zod partagés (réutilisés par devis / facture / situation)
// ─────────────────────────────────────────────────────────────

/** Type de remise : tout ce qui n'est pas 'pourcent'/'montant' devient null. */
export const remiseGlobaleTypeField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === 'pourcent' || v === 'montant' ? v : null));

/** Valeur de la remise : chaîne/nombre ≥ 0 → "0.00", vide/null → null. */
export const remiseGlobaleValeurField = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Remise invalide.' });
      return z.NEVER;
    }
    return n.toFixed(2);
  });

/**
 * Cohérence type ↔ valeur, à brancher dans un `.superRefine()` après avoir
 * ajouté les deux champs à un schéma : une remise typée exige une valeur > 0,
 * et un pourcentage ne peut dépasser 100.
 */
export function refineRemiseGlobale(
  data: { remiseGlobaleType: RemiseGlobaleType | null; remiseGlobaleValeur: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.remiseGlobaleType === null) return;
  if (data.remiseGlobaleValeur === null || Number(data.remiseGlobaleValeur) <= 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['remiseGlobaleValeur'],
      message: 'Indiquez un montant de remise supérieur à 0.',
    });
    return;
  }
  if (data.remiseGlobaleType === 'pourcent' && Number(data.remiseGlobaleValeur) > 100) {
    ctx.addIssue({
      code: 'custom',
      path: ['remiseGlobaleValeur'],
      message: 'La remise en pourcentage ne peut pas dépasser 100 %.',
    });
  }
}
