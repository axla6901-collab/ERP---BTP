import type { TypeVehicule } from '@/lib/validation/flotte';

/**
 * Logique pure des échéances de la flotte (cœur des alertes J-30) et du contrôle
 * de validité du permis du conducteur. Aucune dépendance Next/DB → testable en
 * isolation. Même approche que `lib/referencement/conformite.ts` : le statut
 * n'est jamais stocké, il est recalculé à partir de la date d'échéance + seuil.
 */

export type StatutEcheance = 'expire' | 'a_renouveler' | 'a_jour';

/** Niveau d'urgence pour le rendu (rose / ambre / neutre des tableaux d'alerte). */
export type NiveauUrgence = 'critique' | 'proche' | 'ok';

export const LIBELLES_STATUT_ECHEANCE: Record<StatutEcheance, string> = {
  expire: 'Expiré',
  a_renouveler: 'À renouveler',
  a_jour: 'À jour',
};

function jourEnNombre(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Nombre de jours entre `dateEcheance` et `aujourdhui` (négatif si dépassée). */
export function joursAvantEcheance(dateEcheance: string, aujourdhui: string): number {
  return Math.round((jourEnNombre(dateEcheance) - jourEnNombre(aujourdhui)) / 86_400_000);
}

/**
 * Statut d'une échéance : expirée (< aujourd'hui), à renouveler (dans le seuil
 * d'alerte), ou à jour. `seuilAlerteJours` est en général 30 (rappel J-30).
 */
export function statutEcheance(
  dateEcheance: string,
  seuilAlerteJours: number,
  aujourdhui: string,
): StatutEcheance {
  const jours = joursAvantEcheance(dateEcheance, aujourdhui);
  if (jours < 0) return 'expire';
  if (jours <= seuilAlerteJours) return 'a_renouveler';
  return 'a_jour';
}

/**
 * Niveau d'urgence pour la coloration des lignes (dashboard / échéancier) :
 *   - `critique` (rose)  : dépassée ou ≤ 7 jours ;
 *   - `proche`  (ambre)  : dans le seuil d'alerte (par défaut 30 j) ;
 *   - `ok`      (neutre) : au-delà.
 */
export function niveauUrgenceEcheance(
  dateEcheance: string,
  seuilAlerteJours: number,
  aujourdhui: string,
): NiveauUrgence {
  const jours = joursAvantEcheance(dateEcheance, aujourdhui);
  if (jours < 0 || jours <= 7) return 'critique';
  if (jours <= seuilAlerteJours) return 'proche';
  return 'ok';
}

/** Une échéance fait partie des alertes si elle est dans son seuil ou dépassée. */
export function estEnAlerte(
  dateEcheance: string,
  seuilAlerteJours: number,
  aujourdhui: string,
): boolean {
  return statutEcheance(dateEcheance, seuilAlerteJours, aujourdhui) !== 'a_jour';
}

// ─────────────────────────────────────────────────────────────
// Contrôle du permis du conducteur (réutilise le module RH ▸ Employés)
// ─────────────────────────────────────────────────────────────

/**
 * Catégories de permis qui couvrent un type de véhicule. Détenir l'une d'elles
 * (valide) suffit. Une liste vide signifie « pas d'exigence de permis routier »
 * (engins de chantier — relèvent du CACES, hors périmètre ; deux-roues : la
 * catégorie A n'est pas gérée dans le référentiel RH actuel).
 */
export const PERMIS_REQUIS_PAR_TYPE: Record<TypeVehicule, readonly string[]> = {
  vl: ['B'],
  vu: ['B'],
  pl: ['C', 'C1'],
  remorque: ['BE', 'C1E', 'CE', 'D1E', 'DE'],
  engin: [],
  deux_roues: [],
};

export function categoriesPermisRequises(typeVehicule: TypeVehicule): readonly string[] {
  return PERMIS_REQUIS_PAR_TYPE[typeVehicule] ?? [];
}

export type PermisLite = { categorie: string; dateValidite: string | null };

export type ControlePermis = {
  /** Le type de véhicule exige un permis routier. */
  requis: boolean;
  /** Le conducteur détient au moins une catégorie couvrante (même expirée). */
  detientCategorie: boolean;
  /** Au moins une catégorie couvrante est valide à la date donnée. */
  valide: boolean;
  /** Avertissement FR (non bloquant) ou `null` si tout est bon. */
  message: string | null;
};

/**
 * Contrôle (non bloquant) que le conducteur affecté détient un permis valide
 * couvrant le type de véhicule. Renvoie un message d'avertissement le cas échéant.
 */
export function controlePermisConducteur(
  typeVehicule: TypeVehicule,
  permis: ReadonlyArray<PermisLite>,
  aujourdhui: string,
): ControlePermis {
  const requises = categoriesPermisRequises(typeVehicule);
  if (requises.length === 0) {
    return { requis: false, detientCategorie: true, valide: true, message: null };
  }
  const couvrants = permis.filter((p) => requises.includes(p.categorie));
  if (couvrants.length === 0) {
    return {
      requis: true,
      detientCategorie: false,
      valide: false,
      message: `Le conducteur ne détient pas le permis requis (${requises.join(' ou ')}).`,
    };
  }
  const valides = couvrants.filter((p) => p.dateValidite === null || p.dateValidite >= aujourdhui);
  if (valides.length === 0) {
    return {
      requis: true,
      detientCategorie: true,
      valide: false,
      message: 'Le permis du conducteur couvrant ce véhicule est expiré.',
    };
  }
  return { requis: true, detientCategorie: true, valide: true, message: null };
}
