/**
 * Planification des processus RH (onboarding, offboarding, mobilité…) —
 * module PUR (aucune I/O), importable côté client comme serveur.
 *
 * Équivalent fonctionnel de Factorial processes (Process → MaterializedProcess)
 * et tasks (Task) : matérialisation des tâches d'un modèle, échéances,
 * progression, retard, clôture proposée, réordonnancement.
 *
 * Dates ISO `YYYY-MM-DD` (cf. ../calendrier) : comparaisons lexicographiques sûres.
 */

import { ajouterJours, lundiDeLaSemaine, type IsoDate } from '../calendrier';
import type {
  ResponsableTache,
  StatutProcessus,
  StatutTache,
  TypeProcessus,
} from '@/lib/validation/test-sirh/enums';

// ─────────────────────────────────────────────────────────────
// Statuts
// ─────────────────────────────────────────────────────────────

/** Statuts d'une tâche restant à traiter. */
export const STATUTS_TACHE_OUVERTS: readonly StatutTache[] = ['a_faire', 'en_cours'];

export function estTacheOuverte(statut: StatutTache): boolean {
  return STATUTS_TACHE_OUVERTS.includes(statut);
}

/** Pas d'ordre entre deux tâches (laisse de la place pour une insertion manuelle). */
export const PAS_ORDRE = 10;

/** Ordre à donner à une nouvelle tâche ajoutée en fin de liste. */
export function ordreSuivant(ordres: readonly number[]): number {
  if (ordres.length === 0) return PAS_ORDRE;
  return Math.max(...ordres) + PAS_ORDRE;
}

// ─────────────────────────────────────────────────────────────
// Matérialisation d'un modèle
// ─────────────────────────────────────────────────────────────

export type ModeleTachePlanifiable = {
  libelle: string;
  description: string | null;
  responsable: ResponsableTache;
  /** Échéance relative à la date de référence (négatif = avant). */
  delaiJours: number;
  ordre: number;
};

export type TachePlanifiee = {
  libelle: string;
  description: string | null;
  responsable: ResponsableTache;
  echeance: IsoDate;
  ordre: number;
  assigneA: string | null;
};

/** Compte utilisateur à assigner par défaut selon le responsable de la tâche. */
export type AssignationsParDefaut = Partial<Record<ResponsableTache, string | null>>;

export function assigneParDefaut(
  responsable: ResponsableTache,
  assignations: AssignationsParDefaut = {},
): string | null {
  return assignations[responsable] ?? null;
}

/** Tâches d'un modèle triées par ordre puis par délai (tri stable). */
export function trierModeleTaches<T extends { ordre: number; delaiJours: number }>(
  taches: readonly T[],
): T[] {
  return [...taches].sort((a, b) => a.ordre - b.ordre || a.delaiJours - b.delaiJours);
}

/**
 * Matérialise les tâches d'un modèle pour un processus : échéance =
 * date de référence + délai, responsable copié, ordre renuméroté (10, 20…),
 * assignation par défaut éventuelle selon le responsable.
 */
export function materialiserTaches(
  modeleTaches: readonly ModeleTachePlanifiable[],
  dateReference: IsoDate,
  assignations: AssignationsParDefaut = {},
): TachePlanifiee[] {
  return trierModeleTaches(modeleTaches).map((t, i) => ({
    libelle: t.libelle,
    description: t.description,
    responsable: t.responsable,
    echeance: ajouterJours(dateReference, t.delaiJours),
    ordre: (i + 1) * PAS_ORDRE,
    assigneA: assigneParDefaut(t.responsable, assignations),
  }));
}

/** Libellé proposé à la création : « <modèle> — <collaborateur> » (borné à 200 caractères). */
export function libelleProcessusParDefaut(nomModele: string, nomEmploye: string): string {
  const parties = [nomModele.trim(), nomEmploye.trim()].filter((p) => p.length > 0);
  return parties.join(' — ').slice(0, 200);
}

/** Libellé de la date pivot selon le type de processus. */
export function libelleDateReference(type: TypeProcessus): string {
  switch (type) {
    case 'onboarding':
      return 'Date d’arrivée';
    case 'offboarding':
      return 'Date de départ';
    case 'mobilite':
      return 'Date de mobilité';
    default:
      return 'Date de référence';
  }
}

/**
 * Date de référence proposée : date d'arrivée du collaborateur pour un
 * onboarding, date de départ pour un offboarding, sinon aujourd'hui.
 */
export function dateReferenceSuggeree(
  type: TypeProcessus,
  employe: { dateArrivee: IsoDate | null; dateDepart: IsoDate | null } | null,
  today: IsoDate,
): IsoDate {
  if (type === 'onboarding' && employe?.dateArrivee) return employe.dateArrivee;
  if (type === 'offboarding' && employe?.dateDepart) return employe.dateDepart;
  return today;
}

/** Délai relatif lisible : `0` → `Jour J`, `-5` → `J-5`, `30` → `J+30`. */
export function formatDelai(delaiJours: number): string {
  if (delaiJours === 0) return 'Jour J';
  return delaiJours > 0 ? `J+${delaiJours}` : `J${delaiJours}`;
}

// ─────────────────────────────────────────────────────────────
// Suivi des tâches
// ─────────────────────────────────────────────────────────────

export type TacheSuivi = { statut: StatutTache; echeance: IsoDate | null };

/** Tâche ouverte dont l'échéance est dépassée (strictement avant aujourd'hui). */
export function estTacheEnRetard(t: TacheSuivi, today: IsoDate): boolean {
  return estTacheOuverte(t.statut) && t.echeance !== null && t.echeance < today;
}

/** Dimanche de la semaine contenant `today`. */
export function finDeSemaine(today: IsoDate): IsoDate {
  return ajouterJours(lundiDeLaSemaine(today), 6);
}

/**
 * Tâche ouverte à échéance d'ici la fin de la semaine (aujourd'hui → dimanche
 * inclus). Les échéances dépassées relèvent du retard, pas de la semaine.
 */
export function estTacheDeLaSemaine(t: TacheSuivi, today: IsoDate): boolean {
  return (
    estTacheOuverte(t.statut) &&
    t.echeance !== null &&
    t.echeance >= today &&
    t.echeance <= finDeSemaine(today)
  );
}

export type Progression = {
  /** Tâches faites. */
  faites: number;
  /** Tâches à réaliser (annulées exclues). */
  total: number;
  annulees: number;
  /** Pourcentage entier de réalisation (0 si aucune tâche). */
  pourcent: number;
};

export function progressionTaches(taches: readonly { statut: StatutTache }[]): Progression {
  let faites = 0;
  let annulees = 0;
  for (const t of taches) {
    if (t.statut === 'faite') faites += 1;
    else if (t.statut === 'annulee') annulees += 1;
  }
  const total = taches.length - annulees;
  return { faites, total, annulees, pourcent: total > 0 ? Math.round((faites / total) * 100) : 0 };
}

/** Plus proche échéance parmi les tâches ouvertes (null si aucune). */
export function prochaineEcheance(taches: readonly TacheSuivi[]): IsoDate | null {
  let min: IsoDate | null = null;
  for (const t of taches) {
    if (!estTacheOuverte(t.statut) || !t.echeance) continue;
    if (min === null || t.echeance < min) min = t.echeance;
  }
  return min;
}

/** Toutes les tâches (hors annulées) sont faites — la clôture du processus est proposée. */
export function processusTerminable(taches: readonly { statut: StatutTache }[]): boolean {
  const p = progressionTaches(taches);
  return p.total > 0 && p.faites === p.total;
}

export type SyntheseProcessus = Progression & {
  enRetard: number;
  ouvertes: number;
  prochaineEcheance: IsoDate | null;
  terminable: boolean;
};

export function syntheseProcessus(
  taches: readonly TacheSuivi[],
  today: IsoDate,
): SyntheseProcessus {
  return {
    ...progressionTaches(taches),
    enRetard: taches.filter((t) => estTacheEnRetard(t, today)).length,
    ouvertes: taches.filter((t) => estTacheOuverte(t.statut)).length,
    prochaineEcheance: prochaineEcheance(taches),
    terminable: processusTerminable(taches),
  };
}

// ─────────────────────────────────────────────────────────────
// Transitions de statut
// ─────────────────────────────────────────────────────────────

export type EtatTache = { statut: StatutTache; dateRealisation: IsoDate | null };

/** Cocher → `faite` réalisée aujourd'hui ; décocher → `a_faire` sans date de réalisation. */
export function transitionCoche(faite: boolean, today: IsoDate): EtatTache {
  return faite
    ? { statut: 'faite', dateRealisation: today }
    : { statut: 'a_faire', dateRealisation: null };
}

/**
 * Nouveau statut d'une tâche : la date de réalisation n'existe que pour
 * `faite` (CHECK `chk_sirh_taches_realisation`) et conserve la date déjà
 * connue si la tâche était déjà faite.
 */
export function transitionStatut(
  statut: StatutTache,
  today: IsoDate,
  dateRealisationActuelle: IsoDate | null = null,
): EtatTache {
  if (statut !== 'faite') return { statut, dateRealisation: null };
  return { statut, dateRealisation: dateRealisationActuelle ?? today };
}

/** Transitions de processus autorisées (réouverture comprise). */
export function transitionProcessusAutorisee(
  actuel: StatutProcessus,
  cible: StatutProcessus,
): boolean {
  if (actuel === cible) return false;
  // Clôturer ou annuler un processus en cours ; rouvrir un processus clos.
  return actuel === 'en_cours' || cible === 'en_cours';
}

// ─────────────────────────────────────────────────────────────
// Filtres, tri, indicateurs
// ─────────────────────────────────────────────────────────────

export type FiltreStatutTache = StatutTache | 'ouvertes' | 'toutes';
export type FiltreEcheanceTache = 'toutes' | 'en_retard' | 'semaine';

export function filtrerTaches<T extends TacheSuivi>(
  taches: readonly T[],
  filtre: { statut: FiltreStatutTache; echeance: FiltreEcheanceTache },
  today: IsoDate,
): T[] {
  return taches.filter((t) => {
    if (filtre.statut === 'ouvertes' && !estTacheOuverte(t.statut)) return false;
    if (filtre.statut !== 'ouvertes' && filtre.statut !== 'toutes' && t.statut !== filtre.statut) {
      return false;
    }
    if (filtre.echeance === 'en_retard') return estTacheEnRetard(t, today);
    if (filtre.echeance === 'semaine') return estTacheDeLaSemaine(t, today);
    return true;
  });
}

/** Tri par échéance croissante (sans échéance en dernier), puis par ordre. */
export function trierTachesParEcheance<T extends TacheSuivi & { ordre: number }>(
  taches: readonly T[],
): T[] {
  return [...taches].sort((a, b) => {
    if (a.echeance !== b.echeance) {
      if (a.echeance === null) return 1;
      if (b.echeance === null) return -1;
      return a.echeance < b.echeance ? -1 : 1;
    }
    return a.ordre - b.ordre;
  });
}

export type KpiOnboarding = {
  /** Tous types confondus. */
  processusEnCours: number;
  onboardingsEnCours: number;
  offboardingsEnCours: number;
  tachesEnRetard: number;
  /** Tâches ouvertes à échéance d'ici dimanche (hors retard). */
  tachesSemaine: number;
};

export function calculerKpiOnboarding(
  processus: readonly { typeProcessus: TypeProcessus; statut: StatutProcessus }[],
  taches: readonly TacheSuivi[],
  today: IsoDate,
): KpiOnboarding {
  const enCours = processus.filter((p) => p.statut === 'en_cours');
  return {
    processusEnCours: enCours.length,
    onboardingsEnCours: enCours.filter((p) => p.typeProcessus === 'onboarding').length,
    offboardingsEnCours: enCours.filter((p) => p.typeProcessus === 'offboarding').length,
    tachesEnRetard: taches.filter((t) => estTacheEnRetard(t, today)).length,
    tachesSemaine: taches.filter((t) => estTacheDeLaSemaine(t, today)).length,
  };
}

// ─────────────────────────────────────────────────────────────
// Réordonnancement (tâches d'un modèle)
// ─────────────────────────────────────────────────────────────

export type SensDeplacement = 'haut' | 'bas';

/**
 * Déplace l'élément `id` d'un cran vers le haut ou le bas. Renvoie la
 * nouvelle liste, ou `null` si le déplacement est impossible (élément absent,
 * déjà en tête / en fin de liste).
 */
export function deplacerDansListe<T extends { id: string }>(
  liste: readonly T[],
  id: string,
  sens: SensDeplacement,
): T[] | null {
  const i = liste.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const j = sens === 'haut' ? i - 1 : i + 1;
  if (j < 0 || j >= liste.length) return null;
  const copie = [...liste];
  [copie[i], copie[j]] = [copie[j]!, copie[i]!];
  return copie;
}

/** Ordres normalisés (10, 20, 30…) selon la position dans la liste. */
export function renumeroter<T extends { id: string }>(
  liste: readonly T[],
): Array<{ id: string; ordre: number }> {
  return liste.map((e, i) => ({ id: e.id, ordre: (i + 1) * PAS_ORDRE }));
}
