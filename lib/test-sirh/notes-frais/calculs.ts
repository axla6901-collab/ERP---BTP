import {
  CATEGORIES_FRAIS,
  STATUTS_FRAIS,
  type CategorieFrais,
  type NatureFrais,
  type StatutFrais,
} from '@/lib/validation/test-sirh/enums';

import { estDateIso } from '../calendrier';
import { formatEuro, formatNombre, versNombre } from '../format';

/**
 * Calculs PURS — Test SIRH › Notes de frais (Factorial expenses : Expense /
 * Mileage / PerDiem). Aucune I/O : importable côté client (aperçu du montant
 * dans la modale) comme côté serveur, où le recalcul fait foi à l'enregistrement.
 */

// ─────────────────────────────────────────────────────────────
// Arrondis
// ─────────────────────────────────────────────────────────────

/**
 * Arrondi décimal « commercial » (demi vers le haut) sans les artefacts binaires
 * de `Math.round(x * 100) / 100` (ex. 1,005 € → 1,01 € et non 1,00 €).
 */
export function arrondir(n: number, decimales = 2): number {
  if (!Number.isFinite(n)) return 0;
  const signe = n < 0 ? -1 : 1;
  const abs = Math.abs(n);
  const texte = String(abs);
  if (texte.includes('e')) {
    const f = 10 ** decimales;
    return (signe * Math.round(abs * f)) / f;
  }
  const entier = Math.round(Number(`${texte}e${decimales}`));
  return signe * Number(`${entier}e-${decimales}`);
}

// ─────────────────────────────────────────────────────────────
// Barème kilométrique (indemnités kilométriques — Factorial Mileage)
// ─────────────────────────────────────────────────────────────

/**
 * Barème kilométrique URSSAF des voitures, applicable aux revenus 2025 —
 * identique aux barèmes 2023 et 2024 (arrêté du 27 mars 2023). `d` = distance
 * annuelle parcourue à titre professionnel, en km :
 *
 * | Puissance | d ≤ 5 000 km | 5 001 à 20 000 km    | d > 20 000 km |
 * |-----------|--------------|----------------------|---------------|
 * | ≤ 3 CV    | d × 0,529    | (d × 0,316) + 1 065  | d × 0,370     |
 * | 4 CV      | d × 0,606    | (d × 0,340) + 1 330  | d × 0,407     |
 * | 5 CV      | d × 0,636    | (d × 0,357) + 1 395  | d × 0,427     |
 * | 6 CV      | d × 0,665    | (d × 0,374) + 1 457  | d × 0,447     |
 * | ≥ 7 CV    | d × 0,697    | (d × 0,394) + 1 515  | d × 0,470     |
 *
 * Véhicule 100 % électrique : montant majoré de 20 %.
 *
 * ⚠️ À VÉRIFIER CHAQUE ANNÉE : le barème est fixé par arrêté et peut être
 * revalorisé (publication au printemps, urssaf.fr / impots.gouv.fr). Mettre à
 * jour `BAREME_KILOMETRIQUE` et `ANNEE_BAREME_KILOMETRIQUE` le cas échéant.
 */
export const ANNEE_BAREME_KILOMETRIQUE = 2025;

/** Une tranche du barème : montant annuel = d × coefficient + fixe. */
export type TrancheBareme = { coefficient: number; fixe: number };

/** Classes de puissance fiscale du barème : `3` = 3 CV et moins, `7` = 7 CV et plus. */
export const CLASSES_PUISSANCE = ['3', '4', '5', '6', '7'] as const;
export type ClassePuissance = (typeof CLASSES_PUISSANCE)[number];

export const LIBELLES_CLASSE_PUISSANCE: Record<ClassePuissance, string> = {
  '3': '3 CV et moins',
  '4': '4 CV',
  '5': '5 CV',
  '6': '6 CV',
  '7': '7 CV et plus',
};

/** Bornes hautes (incluses) des deux premières tranches de distance annuelle. */
export const SEUILS_DISTANCE_BAREME = { premiere: 5000, deuxieme: 20000 } as const;

export const BAREME_KILOMETRIQUE: Record<
  ClassePuissance,
  readonly [TrancheBareme, TrancheBareme, TrancheBareme]
> = {
  '3': [
    { coefficient: 0.529, fixe: 0 },
    { coefficient: 0.316, fixe: 1065 },
    { coefficient: 0.37, fixe: 0 },
  ],
  '4': [
    { coefficient: 0.606, fixe: 0 },
    { coefficient: 0.34, fixe: 1330 },
    { coefficient: 0.407, fixe: 0 },
  ],
  '5': [
    { coefficient: 0.636, fixe: 0 },
    { coefficient: 0.357, fixe: 1395 },
    { coefficient: 0.427, fixe: 0 },
  ],
  '6': [
    { coefficient: 0.665, fixe: 0 },
    { coefficient: 0.374, fixe: 1457 },
    { coefficient: 0.447, fixe: 0 },
  ],
  '7': [
    { coefficient: 0.697, fixe: 0 },
    { coefficient: 0.394, fixe: 1515 },
    { coefficient: 0.47, fixe: 0 },
  ],
};

/** Majoration du barème pour un véhicule 100 % électrique (+ 20 %). */
export const MAJORATION_ELECTRIQUE = 0.2;

/** Classe du barème pour une puissance fiscale (CV). */
export function classePuissance(cv: number): ClassePuissance {
  if (!Number.isFinite(cv) || cv <= 3) return '3';
  if (cv >= 7) return '7';
  return String(Math.floor(cv)) as ClassePuissance;
}

/**
 * Indemnité kilométrique ANNUELLE du barème pour `distanceAnnuelle` km
 * parcourus dans l'année, arrondie au centime (+ 20 % si électrique).
 */
export function baremeKilometrique(
  cv: number,
  distanceAnnuelle: number,
  electrique = false,
): number {
  if (!Number.isFinite(distanceAnnuelle) || distanceAnnuelle <= 0) return 0;
  const [t1, t2, t3] = BAREME_KILOMETRIQUE[classePuissance(cv)];
  const tranche =
    distanceAnnuelle <= SEUILS_DISTANCE_BAREME.premiere
      ? t1
      : distanceAnnuelle <= SEUILS_DISTANCE_BAREME.deuxieme
        ? t2
        : t3;
  const montant = distanceAnnuelle * tranche.coefficient + tranche.fixe;
  return arrondir(electrique ? montant * (1 + MAJORATION_ELECTRIQUE) : montant, 2);
}

/**
 * Taux €/km de la 1re tranche du barème (≤ 5 000 km/an) — taux proposé par
 * défaut pour une note d'IK (modifiable) —, majoré de 20 % si électrique,
 * arrondi au millième (colonne `taux_km numeric(6,3)`).
 */
export function tauxKmPremiereTranche(cv: number, electrique = false): number {
  const [premiere] = BAREME_KILOMETRIQUE[classePuissance(cv)];
  return arrondir(premiere.coefficient * (electrique ? 1 + MAJORATION_ELECTRIQUE : 1), 3);
}

/**
 * La case « véhicule électrique » n'est pas stockée : on la déduit d'un taux
 * enregistré égal au taux électrique de la 1re tranche (réouverture d'une note).
 */
export function estTauxElectrique(cv: number | null, tauxKm: number | null): boolean {
  if (cv === null || tauxKm === null) return false;
  return Math.abs(tauxKm - tauxKmPremiereTranche(cv, true)) < 0.0005;
}

/** Montant d'une note d'IK : distance × taux, arrondi au centime. */
export function montantIndemniteKm(distanceKm: number, tauxKm: number): number {
  if (!(distanceKm > 0) || !(tauxKm > 0)) return 0;
  return arrondir(distanceKm * tauxKm, 2);
}

// ─────────────────────────────────────────────────────────────
// Forfaits (panier, grand déplacement… — Factorial PerDiem) & TVA
// ─────────────────────────────────────────────────────────────

/** Montant d'une note forfaitaire : nombre de forfaits × montant unitaire. */
export function montantForfait(nbForfaits: number, montantUnitaire: number): number {
  if (!(nbForfaits > 0) || !(montantUnitaire >= 0)) return 0;
  return arrondir(nbForfaits * montantUnitaire, 2);
}

/** Taux de TVA proposés à la saisie d'une dépense (%). */
export const TAUX_TVA_FRAIS = [20, 10, 5.5, 2.1] as const;

/** TVA incluse dans un montant TTC au taux `tauxPct` (%), arrondie au centime. */
export function tvaDepuisTtc(ttc: number, tauxPct: number): number {
  if (!(ttc > 0) || !(tauxPct > 0)) return 0;
  return arrondir(ttc - ttc / (1 + tauxPct / 100), 2);
}

/** Montant HT d'une dépense (TTC − TVA récupérable). */
export function montantHt(ttc: number, tva: number | null): number {
  return arrondir(ttc - (tva ?? 0), 2);
}

/**
 * Détail du calcul affiché sous le montant : `42 km · 5 CV · 0,636 €/km` pour
 * des IK, `5 × 10,40 €` pour un forfait, `null` pour une dépense.
 */
export function detailMontantNoteFrais(n: {
  nature: NatureFrais;
  distanceKm: number | null;
  puissanceFiscale: number | null;
  tauxKm: number | null;
  nbForfaits: number | null;
  montantUnitaire: number | null;
}): string | null {
  if (n.nature === 'indemnite_km' && n.distanceKm !== null) {
    const parties = [`${formatNombre(n.distanceKm)} km`];
    if (n.puissanceFiscale !== null) parties.push(`${n.puissanceFiscale} CV`);
    if (n.tauxKm !== null) parties.push(`${formatNombre(n.tauxKm, 3)} €/km`);
    return parties.join(' · ');
  }
  if (n.nature === 'forfait' && n.nbForfaits !== null && n.montantUnitaire !== null) {
    return `${formatNombre(n.nbForfaits)} × ${formatEuro(n.montantUnitaire)}`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Catégories proposées selon la nature
// ─────────────────────────────────────────────────────────────

const CATEGORIES_PAR_NATURE: Record<NatureFrais, readonly CategorieFrais[]> = {
  depense: CATEGORIES_FRAIS.filter((c) => c !== 'panier'),
  indemnite_km: ['transport', 'grand_deplacement', 'autre'],
  forfait: ['panier', 'grand_deplacement', 'repas', 'hebergement', 'autre'],
};

const CATEGORIE_DEFAUT: Record<NatureFrais, CategorieFrais> = {
  depense: 'repas',
  indemnite_km: 'transport',
  forfait: 'panier',
};

/** Catégories cohérentes avec une nature de frais (sélecteur de la modale). */
export function categoriesPourNature(nature: NatureFrais): readonly CategorieFrais[] {
  return CATEGORIES_PAR_NATURE[nature];
}

/** Catégorie proposée à la sélection d'une nature. */
export function categorieParDefaut(nature: NatureFrais): CategorieFrais {
  return CATEGORIE_DEFAUT[nature];
}

// ─────────────────────────────────────────────────────────────
// Normalisation des montants (fait foi côté serveur)
// ─────────────────────────────────────────────────────────────

type ValeurSaisie = string | number | null | undefined;

export type SaisieMontantsNoteFrais = {
  nature: NatureFrais;
  montantTtc: ValeurSaisie;
  montantTva: ValeurSaisie;
  distanceKm: ValeurSaisie;
  puissanceFiscale: ValeurSaisie;
  vehiculeElectrique: boolean;
  tauxKm: ValeurSaisie;
  nbForfaits: ValeurSaisie;
  montantUnitaire: ValeurSaisie;
};

/** Colonnes chiffrées d'une note, au format des colonnes `numeric` Drizzle. */
export type MontantsNoteFrais = {
  montantTtc: string;
  montantTva: string | null;
  distanceKm: string | null;
  puissanceFiscale: number | null;
  tauxKm: string | null;
  nbForfaits: string | null;
  montantUnitaire: string | null;
};

/**
 * Colonnes chiffrées d'une note selon sa nature : les champs étrangers à la
 * nature passent à NULL et le montant TTC est RECALCULÉ pour les IK
 * (distance × taux, taux du barème si non saisi) et les forfaits
 * (nombre × unitaire) — le montant envoyé par le client ne fait pas foi.
 */
export function normaliserMontantsNoteFrais(s: SaisieMontantsNoteFrais): MontantsNoteFrais {
  const vide: MontantsNoteFrais = {
    montantTtc: '0.00',
    montantTva: null,
    distanceKm: null,
    puissanceFiscale: null,
    tauxKm: null,
    nbForfaits: null,
    montantUnitaire: null,
  };

  if (s.nature === 'indemnite_km') {
    const distance = arrondir(versNombre(s.distanceKm) ?? 0, 1);
    const cvSaisi = versNombre(s.puissanceFiscale);
    const cv = cvSaisi === null ? null : Math.round(cvSaisi);
    const tauxSaisi = versNombre(s.tauxKm);
    const taux = arrondir(
      tauxSaisi !== null && tauxSaisi > 0
        ? tauxSaisi
        : tauxKmPremiereTranche(cv ?? 0, s.vehiculeElectrique),
      3,
    );
    return {
      ...vide,
      montantTtc: montantIndemniteKm(distance, taux).toFixed(2),
      distanceKm: distance.toFixed(1),
      puissanceFiscale: cv,
      tauxKm: taux.toFixed(3),
    };
  }

  if (s.nature === 'forfait') {
    const nb = arrondir(versNombre(s.nbForfaits) ?? 0, 1);
    const unitaire = arrondir(versNombre(s.montantUnitaire) ?? 0, 2);
    return {
      ...vide,
      montantTtc: montantForfait(nb, unitaire).toFixed(2),
      nbForfaits: nb.toFixed(1),
      montantUnitaire: unitaire.toFixed(2),
    };
  }

  const ttc = arrondir(versNombre(s.montantTtc) ?? 0, 2);
  const tva = versNombre(s.montantTva);
  return {
    ...vide,
    montantTtc: ttc.toFixed(2),
    montantTva: tva === null ? null : arrondir(tva, 2).toFixed(2),
  };
}

// ─────────────────────────────────────────────────────────────
// Workflow (brouillon → soumise → approuvée/refusée → remboursée)
// ─────────────────────────────────────────────────────────────

/** Changements de statut autorisés (hors simple modification). */
export const TRANSITIONS_STATUT_FRAIS: Record<StatutFrais, readonly StatutFrais[]> = {
  brouillon: ['soumise'],
  // Retour en brouillon = retrait par son auteur avant décision.
  soumise: ['brouillon', 'approuvee', 'refusee'],
  approuvee: ['remboursee'],
  refusee: [],
  remboursee: [],
};

export function transitionFraisAutorisee(de: StatutFrais, vers: StatutFrais): boolean {
  return TRANSITIONS_STATUT_FRAIS[de].includes(vers);
}

/** Une note se modifie tant qu'aucune décision n'a été prise. */
export function noteFraisModifiable(statut: StatutFrais): boolean {
  return statut === 'brouillon' || statut === 'soumise';
}

/** Seul un brouillon peut être supprimé. */
export function noteFraisSupprimable(statut: StatutFrais): boolean {
  return statut === 'brouillon';
}

/**
 * Statut d'une note après enregistrement (création si `statutActuel` est
 * null), ou `null` si la note n'est plus modifiable.
 */
export function statutApresEnregistrement(
  statutActuel: StatutFrais | null,
  soumettre: boolean,
): StatutFrais | null {
  if (statutActuel !== null && !noteFraisModifiable(statutActuel)) return null;
  return soumettre ? 'soumise' : 'brouillon';
}

export function statutApresDecision(decision: 'approuver' | 'refuser'): 'approuvee' | 'refusee' {
  return decision === 'approuver' ? 'approuvee' : 'refusee';
}

export type DroitsNoteFrais = {
  modifier: boolean;
  soumettre: boolean;
  decider: boolean;
  rembourser: boolean;
  supprimer: boolean;
};

export type ActeurNoteFrais = {
  utilisateurId: string;
  /** Employé rattaché à l'utilisateur courant (null si aucun). */
  employeId: string | null;
  /** Gestion RH (admin, RH) : agit pour tous les employés. */
  gerer: boolean;
  /** Valideur (admin, RH, conducteur de travaux, chef de chantier). */
  valider: boolean;
  /** Paie ou gestion (admin, RH, comptable) : marque les notes remboursées. */
  rembourser: boolean;
  /** Administrateur : seul autorisé à statuer sur sa propre note. */
  admin: boolean;
};

/**
 * Droits de l'utilisateur sur une note (boutons affichés ET contrôles serveur) :
 * - modifier / soumettre : gestionnaire RH ou salarié concerné, avant décision ;
 * - décider : valideur, note soumise, jamais sur sa propre note (sauf admin) ;
 * - rembourser : paie ou gestion, note approuvée ;
 * - supprimer : brouillon, par son auteur (ou un gestionnaire RH).
 */
export function droitsNoteFrais(
  note: { statut: StatutFrais; employeId: string; createdBy: string | null },
  acteur: ActeurNoteFrais,
): DroitsNoteFrais {
  const estConcerne = acteur.employeId !== null && acteur.employeId === note.employeId;
  const agit = acteur.gerer || estConcerne;
  const estAuteur = note.createdBy !== null && note.createdBy === acteur.utilisateurId;
  return {
    modifier: agit && noteFraisModifiable(note.statut),
    soumettre: agit && note.statut === 'brouillon',
    decider: acteur.valider && note.statut === 'soumise' && (!estConcerne || acteur.admin),
    rembourser: acteur.rembourser && note.statut === 'approuvee',
    supprimer: noteFraisSupprimable(note.statut) && (estAuteur || acteur.gerer),
  };
}

// ─────────────────────────────────────────────────────────────
// Indicateurs (StatGrid de la page, tableau de bord)
// ─────────────────────────────────────────────────────────────

export type LigneKpiNoteFrais = {
  statut: StatutFrais;
  nature: NatureFrais;
  dateDepense: string;
  montantTtc: number;
  distanceKm: number | null;
};

export type KpiNotesFrais = {
  /** Notes soumises en attente de décision. */
  aValider: { nombre: number; montant: number };
  /** Dépenses du mois courant (soumises, approuvées, remboursées). */
  mois: { nombre: number; montant: number };
  /** Notes approuvées non encore remboursées. */
  aRembourser: { nombre: number; montant: number };
  /** Indemnités kilométriques du mois courant (hors brouillons et refus). */
  ikMois: { nombre: number; montant: number; km: number };
};

const STATUTS_ENGAGES: readonly StatutFrais[] = ['soumise', 'approuvee', 'remboursee'];

/** Agrège les indicateurs à partir des notes (le mois courant est celui de `today`). */
export function agregerKpiNotesFrais(
  lignes: readonly LigneKpiNoteFrais[],
  today: string,
): KpiNotesFrais {
  const mois = today.slice(0, 7);
  const kpi: KpiNotesFrais = {
    aValider: { nombre: 0, montant: 0 },
    mois: { nombre: 0, montant: 0 },
    aRembourser: { nombre: 0, montant: 0 },
    ikMois: { nombre: 0, montant: 0, km: 0 },
  };
  for (const l of lignes) {
    if (l.statut === 'soumise') {
      kpi.aValider.nombre += 1;
      kpi.aValider.montant += l.montantTtc;
    }
    if (l.statut === 'approuvee') {
      kpi.aRembourser.nombre += 1;
      kpi.aRembourser.montant += l.montantTtc;
    }
    if (l.dateDepense.slice(0, 7) === mois && STATUTS_ENGAGES.includes(l.statut)) {
      kpi.mois.nombre += 1;
      kpi.mois.montant += l.montantTtc;
      if (l.nature === 'indemnite_km') {
        kpi.ikMois.nombre += 1;
        kpi.ikMois.montant += l.montantTtc;
        kpi.ikMois.km += l.distanceKm ?? 0;
      }
    }
  }
  kpi.aValider.montant = arrondir(kpi.aValider.montant, 2);
  kpi.aRembourser.montant = arrondir(kpi.aRembourser.montant, 2);
  kpi.mois.montant = arrondir(kpi.mois.montant, 2);
  kpi.ikMois.montant = arrondir(kpi.ikMois.montant, 2);
  kpi.ikMois.km = arrondir(kpi.ikMois.km, 1);
  return kpi;
}

// ─────────────────────────────────────────────────────────────
// Filtres d'URL de la liste (`?statut=…&employe=…&mois=AAAA-MM`)
// ─────────────────────────────────────────────────────────────

export const FILTRES_STATUT_FRAIS = [
  'soumise',
  'approuvee',
  'remboursee',
  'refusee',
  'brouillon',
  'toutes',
] as const;
export type FiltreStatutFrais = (typeof FILTRES_STATUT_FRAIS)[number];

export const LIBELLES_FILTRE_STATUT_FRAIS: Record<FiltreStatutFrais, string> = {
  soumise: 'À valider',
  approuvee: 'Approuvées',
  remboursee: 'Remboursées',
  refusee: 'Refusées',
  brouillon: 'Brouillons',
  toutes: 'Toutes',
};

export type FiltresNotesFrais = {
  statut: FiltreStatutFrais;
  employeId: string | null;
  /** Mois `AAAA-MM` de la date de dépense, ou null. */
  mois: string | null;
};

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lit les filtres depuis les paramètres d'URL (valeurs invalides ignorées ; soumises par défaut). */
export function lireFiltresNotesFrais(sp: {
  statut?: string | undefined;
  employe?: string | undefined;
  mois?: string | undefined;
}): FiltresNotesFrais {
  const statut = (FILTRES_STATUT_FRAIS as readonly string[]).includes(sp.statut ?? '')
    ? (sp.statut as FiltreStatutFrais)
    : 'soumise';
  const employeId = sp.employe && REGEX_UUID.test(sp.employe) ? sp.employe : null;
  const mois = sp.mois && estDateIso(`${sp.mois}-01`) ? sp.mois : null;
  return { statut, employeId, mois };
}

/** Statuts SQL correspondant à un filtre (`null` = tous). */
export function statutsDuFiltre(filtre: FiltreStatutFrais): readonly StatutFrais[] | null {
  if (filtre === 'toutes') return null;
  return STATUTS_FRAIS.filter((s) => s === filtre);
}

/** Construit l'URL de la liste en conservant les autres filtres. */
export function urlNotesFrais(base: string, filtres: Partial<FiltresNotesFrais>): string {
  const params = new URLSearchParams();
  if (filtres.statut && filtres.statut !== 'soumise') params.set('statut', filtres.statut);
  if (filtres.employeId) params.set('employe', filtres.employeId);
  if (filtres.mois) params.set('mois', filtres.mois);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
