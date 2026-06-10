import type {
  ComposantLigneInput,
  LigneDevisInput,
  PosteInterneFormInput,
} from '@/lib/validation/commercial';

import {
  calculerVentilation,
  type LigneVentilable,
  type PosteInterneVentilable,
} from './ventilation';

/**
 * Calcule le PU d'une ligne à partir de ses composants articles :
 * Σ (quantite_par_unite × prix_unitaire_ht). Retourne `null` si aucun
 * composant n'est attaché (le PU saisi manuellement reste alors la
 * source de vérité). Ne tient pas compte des remises/TVA — c'est le PU
 * brut avant application des taux.
 */
export function calculerPuDepuisComposants(
  composants: ComposantLigneInput[],
): string | null {
  if (composants.length === 0) return null;
  let total = 0;
  for (const c of composants) {
    const qpu = Number(c.quantiteParUnite);
    const pu = Number(c.prixUnitaireHt);
    if (!Number.isFinite(qpu) || !Number.isFinite(pu)) continue;
    total += qpu * pu;
  }
  return total.toFixed(2);
}

/**
 * Retourne le PU effectif (avant ventilation) d'une ligne : dérivé de
 * ses composants si présents, sinon PU saisi manuellement.
 */
function puDeBase(ligne: LigneDevisInput): number {
  if (ligne.type === 'section') return 0;
  if (ligne.composants && ligne.composants.length > 0) {
    return Number(calculerPuDepuisComposants(ligne.composants) ?? '0');
  }
  return Number(ligne.prixUnitaireHt ?? 0);
}

/**
 * Une contribution HT/TVA d'une ligne, ventilée par taux TVA. Une ligne
 * sans override de composant produit une seule contribution. Avec
 * overrides, chaque composant produit sa propre contribution dans son
 * bucket TVA.
 */
export type ContributionTvaLigne = {
  /** HT après remise. */
  ht: number;
  /** TVA = ht × tauxTva / 100. */
  tva: number;
  /** Taux TVA appliqué, format "20.00". */
  tauxTva: string;
};

/**
 * Décompose le HT/TVA d'une ligne en contributions par taux TVA.
 *
 * Sémantique override per-composant (M3.1) :
 * - Composant catalogue : hérite toujours de la ligne (TVA + remise).
 * - Composant libre : utilise son propre `tauxTva` / `remisePourcent`
 *   s'il est renseigné, sinon hérite de la ligne.
 * - Apport de ventilation (postes internes) : toujours au taux/remise
 *   de la ligne (le poste interne ne « connaît » pas les composants).
 * - Ligne sans composant : un seul bucket au taux de la ligne.
 */
export function calculerContributionsLigne(
  ligne: LigneDevisInput,
  apportHt: number = 0,
): ContributionTvaLigne[] {
  if (ligne.type === 'section') return [];
  const qty = Number(ligne.quantite);
  if (!Number.isFinite(qty)) return [];

  const lineRemise = Number(ligne.remisePourcent ?? '0');
  const lineTauxTva = String(ligne.tauxTva);
  const lineTauxNum = Number(lineTauxTva);

  const composants = ligne.composants ?? [];

  // Pas de composants : un seul bucket (PU manuel + apport).
  if (composants.length === 0) {
    const pu = Number(ligne.prixUnitaireHt ?? 0);
    const puEffectif = qty > 0 ? pu + apportHt / qty : pu;
    const brutHt = qty * puEffectif;
    const ht = brutHt * (1 - lineRemise / 100);
    const tva = ht * (lineTauxNum / 100);
    return [{ ht, tva, tauxTva: lineTauxTva }];
  }

  const contributions: ContributionTvaLigne[] = [];
  for (const c of composants) {
    const qpu = Number(c.quantiteParUnite);
    const pu = Number(c.prixUnitaireHt);
    if (!Number.isFinite(qpu) || !Number.isFinite(pu)) continue;

    const remiseOverride =
      c.type === 'libre' && c.remisePourcent !== null
        ? Number(c.remisePourcent)
        : null;
    const tauxOverride =
      c.type === 'libre' && c.tauxTva !== null ? String(c.tauxTva) : null;

    const effRemise = remiseOverride !== null ? remiseOverride : lineRemise;
    const effTauxTva = tauxOverride !== null ? tauxOverride : lineTauxTva;
    const effTauxNum = Number(effTauxTva);

    const ht = qty * qpu * pu * (1 - effRemise / 100);
    const tva = ht * (effTauxNum / 100);
    contributions.push({ ht, tva, tauxTva: effTauxTva });
  }

  // L'apport poste interne est ventilé au taux/remise de la ligne, ajouté
  // séparément des composants (ne rentre pas dans le PU des composants).
  if (apportHt > 0) {
    const htApport = apportHt * (1 - lineRemise / 100);
    const tvaApport = htApport * (lineTauxNum / 100);
    contributions.push({ ht: htApport, tva: tvaApport, tauxTva: lineTauxTva });
  }

  return contributions;
}

/**
 * Calcule les montants d'une ligne de devis (HT, TVA, TTC).
 * Pour une section : tout est null. Sinon, somme les contributions par
 * bucket TVA (cf. [[calculerContributionsLigne]]).
 *
 * @param apportHt — apport de la ventilation des postes internes pour cette
 *                   ligne. Toujours au taux/remise de la ligne (pas affecté
 *                   par les overrides de composants). Vaut 0 par défaut.
 */
export function calculerMontantLigne(
  ligne: LigneDevisInput,
  apportHt: number = 0,
): {
  montantHt: string | null;
  montantTva: string | null;
  montantTtc: string | null;
} {
  if (ligne.type === 'section') {
    return { montantHt: null, montantTva: null, montantTtc: null };
  }
  const contributions = calculerContributionsLigne(ligne, apportHt);
  let ht = 0;
  let tva = 0;
  for (const c of contributions) {
    ht += c.ht;
    tva += c.tva;
  }
  return {
    montantHt: ht.toFixed(2),
    montantTva: tva.toFixed(2),
    montantTtc: (ht + tva).toFixed(2),
  };
}

export type DetailsTva = Record<string, { base: string; tva: string }>;

/**
 * Construit la représentation ventilable d'une ligne (utile pour les
 * fonctions de [[lib/commercial/ventilation.ts]] qui n'ont pas besoin du
 * type complet `LigneDevisInput`).
 */
function ligneEnVentilable(l: LigneDevisInput, ordre: number): LigneVentilable {
  return {
    ordre,
    type: l.type,
    quantite: l.type === 'section' ? null : l.quantite,
    prixUnitaireHt: l.type === 'section' ? null : String(puDeBase(l)),
    remisePourcent: l.type === 'section' ? null : (l.remisePourcent ?? '0'),
  };
}

function posteEnVentilable(p: PosteInterneFormInput): PosteInterneVentilable {
  return {
    montantHt: p.montantHt,
    portee: p.portee,
    chapitreOrdre: p.portee === 'chapitre' ? p.chapitreOrdre : null,
    repartitions: p.repartitions.map((r) => ({
      ordreLigne: r.ordreLigne,
      poids: r.poids,
    })),
  };
}

/**
 * Calcule les totaux d'un devis :
 *  - totalHt, totalTva, totalTtc
 *  - detailsTva : ventilation par taux ({"20.00": {base: "...", tva: "..."}, ...})
 *
 * Le total HT est **all-in** : il inclut le montant des postes internes
 * ventilés sur les lignes (PU effectif × qté). C'est le total visible au
 * client. Les sections sont ignorées dans le calcul.
 *
 * Depuis l'override per-composant, une même ligne peut contribuer à
 * plusieurs buckets TVA simultanément.
 */
export function calculerTotauxDevis(
  lignes: LigneDevisInput[],
  postesInternes: PosteInterneFormInput[] = [],
): {
  totalHt: string;
  totalTva: string;
  totalTtc: string;
  detailsTva: DetailsTva;
} {
  const apports = calculerVentilation(
    lignes.map((l, i) => ligneEnVentilable(l, i)),
    postesInternes.map((p) => posteEnVentilable(p)),
  );

  let totalHt = 0;
  let totalTva = 0;
  const details = new Map<string, { base: number; tva: number }>();

  lignes.forEach((ligne, i) => {
    if (ligne.type === 'section') return;
    const apportHt = apports.get(i) ?? 0;
    const contributions = calculerContributionsLigne(ligne, apportHt);
    for (const c of contributions) {
      totalHt += c.ht;
      totalTva += c.tva;
      const current = details.get(c.tauxTva) ?? { base: 0, tva: 0 };
      details.set(c.tauxTva, {
        base: current.base + c.ht,
        tva: current.tva + c.tva,
      });
    }
  });

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
