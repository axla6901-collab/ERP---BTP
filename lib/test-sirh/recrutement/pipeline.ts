/**
 * Logique métier PURE du recrutement (Factorial ats : Application, HiringStage,
 * JobPosting) — aucune I/O, importable côté client comme serveur.
 *
 * - pipeline des candidatures : étapes suivante / précédente, transitions
 *   autorisées (une candidature close ne bouge plus, sauf réouverture explicite),
 *   regroupement en colonnes de kanban ;
 * - passerelle recrutement → RH : type de contrat SIRH → type `employes` ;
 * - RGPD : un candidat sans activité depuis plus de 24 mois est « à purger » ;
 * - offres : règle « pourvue », transitions de statut et dates associées.
 */

import type { Employe } from '@/db/schema/employes';
import {
  ETAPES_CLOSES,
  ETAPES_PIPELINE,
  LIBELLES_ETAPE_CANDIDATURE,
  LIBELLES_STATUT_OFFRE,
  type EtapeCandidature,
  type StatutOffre,
  type TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';

import { ajouterMois, type IsoDate } from '../calendrier';
import { formatEuroArrondi, formatNombre, versNombre } from '../format';

// ─────────────────────────────────────────────────────────────
// Étapes du pipeline
// ─────────────────────────────────────────────────────────────

/** Étape terminale (embauche, refus, désistement) : la candidature est close. */
export function estEtapeClose(etape: EtapeCandidature): boolean {
  return ETAPES_CLOSES.includes(etape);
}

/** Étape active du pipeline (colonne du kanban). */
export function estEtapePipeline(etape: EtapeCandidature): boolean {
  return ETAPES_PIPELINE.includes(etape);
}

/**
 * Étape suivante dans le pipeline actif, ou `null` en fin de pipeline (l'étape
 * d'après la proposition est l'embauche, qui passe par sa propre action) ou si
 * la candidature est close.
 */
export function etapeSuivante(etape: EtapeCandidature): EtapeCandidature | null {
  const i = ETAPES_PIPELINE.indexOf(etape);
  if (i < 0) return null;
  return ETAPES_PIPELINE[i + 1] ?? null;
}

/** Étape précédente dans le pipeline actif, ou `null` (1re étape / candidature close). */
export function etapePrecedente(etape: EtapeCandidature): EtapeCandidature | null {
  const i = ETAPES_PIPELINE.indexOf(etape);
  if (i <= 0) return null;
  return ETAPES_PIPELINE[i - 1] ?? null;
}

export type VerdictTransition = { ok: true } | { ok: false; raison: string };

/**
 * Une candidature peut-elle passer de `de` à `vers` ?
 *
 * - candidature active : tout déplacement vers une autre étape est permis
 *   (avance, retour arrière, refus, désistement, embauche) ;
 * - candidature close : immobile, sauf `reouverture` explicite vers une étape
 *   du pipeline — et jamais après une embauche (la fiche employé existe) ;
 * - une réouverture ne s'applique qu'à une candidature close.
 */
export function transitionCandidature(
  de: EtapeCandidature,
  vers: EtapeCandidature,
  opts: { reouverture?: boolean } = {},
): VerdictTransition {
  if (de === vers) {
    return {
      ok: false,
      raison: `La candidature est déjà à l’étape « ${LIBELLES_ETAPE_CANDIDATURE[vers]} ».`,
    };
  }
  if (estEtapeClose(de)) {
    if (!opts.reouverture) {
      return {
        ok: false,
        raison: 'Candidature close : rouvrez-la explicitement avant de la déplacer.',
      };
    }
    if (de === 'embauche') {
      return {
        ok: false,
        raison: 'Embauche réalisée : la candidature ne peut plus être rouverte.',
      };
    }
    if (!estEtapePipeline(vers)) {
      return { ok: false, raison: 'Une réouverture replace la candidature dans le pipeline.' };
    }
    return { ok: true };
  }
  if (opts.reouverture) {
    return { ok: false, raison: 'La candidature n’est pas close : rien à rouvrir.' };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Regroupement en colonnes (kanban)
// ─────────────────────────────────────────────────────────────

/** Champs nécessaires au regroupement / tri d'une candidature. */
export type CandidaturePourTri = {
  etape: EtapeCandidature;
  note: number | null;
  dateCandidature: string;
  nom: string;
  prenom: string;
};

/** Clé de tri alphabétique déterministe (sans `Intl` : rendu serveur = client). */
function cleAlpha(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function comparerTexte(a: string, b: string): number {
  const ca = cleAlpha(a);
  const cb = cleAlpha(b);
  if (ca < cb) return -1;
  if (ca > cb) return 1;
  return 0;
}

/**
 * Ordre d'affichage dans une colonne : meilleure note d'abord (sans note en
 * dernier), puis candidature la plus ancienne (premier arrivé), puis nom.
 */
export function comparerCandidatures(a: CandidaturePourTri, b: CandidaturePourTri): number {
  const na = a.note ?? 0;
  const nb = b.note ?? 0;
  if (na !== nb) return nb - na;
  if (a.dateCandidature !== b.dateCandidature) {
    return a.dateCandidature < b.dateCandidature ? -1 : 1;
  }
  return comparerTexte(`${a.nom} ${a.prenom}`, `${b.nom} ${b.prenom}`);
}

export type ColonnePipeline<T> = { etape: EtapeCandidature; candidatures: T[] };

/**
 * Répartit les candidatures par étape : colonnes du pipeline actif (dans
 * l'ordre de `ETAPES_PIPELINE`, colonnes vides incluses) et groupes clôturés
 * (ordre de `ETAPES_CLOSES`). Chaque groupe est trié par `comparerCandidatures`.
 */
export function regrouperParColonne<T extends CandidaturePourTri>(
  candidatures: readonly T[],
): { colonnes: ColonnePipeline<T>[]; closes: ColonnePipeline<T>[] } {
  const grouper = (etapes: readonly EtapeCandidature[]) =>
    etapes.map((etape) => ({
      etape,
      candidatures: candidatures.filter((c) => c.etape === etape).sort(comparerCandidatures),
    }));
  return { colonnes: grouper(ETAPES_PIPELINE), closes: grouper(ETAPES_CLOSES) };
}

/** Indicateurs d'un pipeline d'offre (bandeau de la page pipeline). */
export function statistiquesPipeline(
  candidatures: ReadonlyArray<{ etape: EtapeCandidature; dateEntretien: string | null }>,
  maintenant: Date,
): { actives: number; entretiensPlanifies: number; embauches: number; closesSansEmbauche: number } {
  let actives = 0;
  let entretiensPlanifies = 0;
  let embauches = 0;
  let closesSansEmbauche = 0;
  for (const c of candidatures) {
    if (estEtapePipeline(c.etape)) {
      actives += 1;
      if (c.dateEntretien && new Date(c.dateEntretien).getTime() >= maintenant.getTime()) {
        entretiensPlanifies += 1;
      }
    } else if (c.etape === 'embauche') {
      embauches += 1;
    } else {
      closesSansEmbauche += 1;
    }
  }
  return { actives, entretiensPlanifies, embauches, closesSansEmbauche };
}

// ─────────────────────────────────────────────────────────────
// Passerelle recrutement → RH (table `employes`)
// ─────────────────────────────────────────────────────────────

/** Type de contrat du module RH (`employes.type_contrat`). */
export type TypeContratRh = Employe['typeContrat'];

const CONTRAT_RH_PAR_TYPE_SIRH: Record<TypeContratSirh, TypeContratRh> = {
  cdi: 'CDI',
  cdi_chantier: 'CDI',
  autre: 'CDI',
  cdd: 'CDD',
  // Le contrat saisonnier est un CDD (art. L1242-2 3° C. trav.).
  saisonnier: 'CDD',
  interim: 'INT',
  apprentissage: 'ALT',
  professionnalisation: 'ALT',
  stage: 'STAGE',
};

/** Type de contrat RH (`employes`) correspondant au type de contrat SIRH. */
export function typeContratRhDepuisSirh(type: TypeContratSirh): TypeContratRh {
  return CONTRAT_RH_PAR_TYPE_SIRH[type];
}

/**
 * La société d'intérim est obligatoire pour un intérimaire
 * (CHECK `chk_employes_interim_societe` : `type_contrat <> 'INT' OR societe_interim IS NOT NULL`).
 */
export function societeInterimRequise(type: TypeContratSirh): boolean {
  return typeContratRhDepuisSirh(type) === 'INT';
}

// ─────────────────────────────────────────────────────────────
// RGPD — conservation des données candidats
// ─────────────────────────────────────────────────────────────

/** Durée de conservation d'un dossier candidat sans activité (recommandation CNIL). */
export const DELAI_RGPD_MOIS = 24;

/** Date (ISO `YYYY-MM-DD`) la plus récente parmi des dates / horodatages ISO ; `null` si aucune. */
export function derniereActivite(dates: ReadonlyArray<string | null | undefined>): IsoDate | null {
  let max: string | null = null;
  for (const d of dates) {
    if (!d) continue;
    const jour = d.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) continue;
    if (max === null || jour > max) max = jour;
  }
  return max;
}

/** Fin de la durée de conservation : dernière activité + 24 mois. */
export function dateLimiteRgpd(derniere: IsoDate): IsoDate {
  return ajouterMois(derniere, DELAI_RGPD_MOIS);
}

/**
 * Le dossier est « à purger » si la dernière activité remonte à PLUS de 24 mois.
 * Un candidat embauché (devenu employé) n'est pas concerné : ses données
 * relèvent désormais du dossier du personnel.
 */
export function estAPurgerRgpd(
  derniere: IsoDate | null,
  today: IsoDate,
  opts: { embauche?: boolean } = {},
): boolean {
  if (opts.embauche || !derniere) return false;
  return today > dateLimiteRgpd(derniere);
}

// ─────────────────────────────────────────────────────────────
// Offres d'emploi
// ─────────────────────────────────────────────────────────────

/** L'offre est pourvue dès que le nombre d'embauches atteint le nombre de postes. */
export function offreEstPourvue(nbEmbauches: number, nbPostes: number): boolean {
  return nbPostes >= 1 && nbEmbauches >= nbPostes;
}

/** Transitions de statut d'une offre (cycle de vie Factorial JobPosting). */
export const TRANSITIONS_STATUT_OFFRE: Record<StatutOffre, readonly StatutOffre[]> = {
  brouillon: ['publiee', 'fermee'],
  publiee: ['suspendue', 'pourvue', 'fermee'],
  suspendue: ['publiee', 'pourvue', 'fermee'],
  pourvue: ['publiee', 'fermee'],
  fermee: ['publiee', 'brouillon'],
};

/** Statuts atteignables depuis `statut`. */
export function transitionsStatutOffre(statut: StatutOffre): readonly StatutOffre[] {
  return TRANSITIONS_STATUT_OFFRE[statut];
}

export function transitionStatutOffreAutorisee(de: StatutOffre, vers: StatutOffre): boolean {
  return TRANSITIONS_STATUT_OFFRE[de].includes(vers);
}

/** Verbe d'action d'une transition de statut (boutons / listes). */
export function libelleTransitionOffre(de: StatutOffre, vers: StatutOffre): string {
  switch (vers) {
    case 'publiee':
      return de === 'brouillon' ? 'Publier' : 'Republier';
    case 'suspendue':
      return 'Suspendre';
    case 'pourvue':
      return 'Marquer pourvue';
    case 'fermee':
      return 'Fermer';
    case 'brouillon':
      return 'Repasser en brouillon';
    default:
      return LIBELLES_STATUT_OFFRE[vers];
  }
}

/** Fourchette de salaire lisible : `2 000 – 2 400 €`, `à partir de 2 000 €`, `—`. */
export function formatFourchetteSalaire(
  min: string | number | null | undefined,
  max: string | number | null | undefined,
): string {
  const a = versNombre(min);
  const b = versNombre(max);
  if (a === null && b === null) return '—';
  if (a !== null && b !== null) {
    return a === b
      ? formatEuroArrondi(a)
      : `${formatNombre(Math.round(a), 0)} – ${formatEuroArrondi(b)}`;
  }
  if (a !== null) return `à partir de ${formatEuroArrondi(a)}`;
  return `jusqu’à ${formatEuroArrondi(b)}`;
}

/** Les offres « ouvertes » acceptent de nouvelles candidatures. */
export function offreAccepteCandidatures(statut: StatutOffre): boolean {
  return statut === 'brouillon' || statut === 'publiee' || statut === 'suspendue';
}

/**
 * Dates d'une offre après passage au statut `statut` :
 * - publication : date de publication = aujourd'hui si absente ; une date de
 *   clôture déjà dépassée est effacée (republication) ;
 * - pourvue / fermée : date de clôture = aujourd'hui si absente (jamais avant
 *   la publication — CHECK `chk_sirh_offres_dates`) ;
 * - brouillon / suspendue : inchangées.
 */
export function datesOffrePourStatut(
  statut: StatutOffre,
  dates: { datePublication: IsoDate | null; dateCloture: IsoDate | null },
  today: IsoDate,
): { datePublication: IsoDate | null; dateCloture: IsoDate | null } {
  const { datePublication, dateCloture } = dates;
  if (statut === 'publiee') {
    return {
      datePublication: datePublication ?? today,
      dateCloture: dateCloture && dateCloture < today ? null : dateCloture,
    };
  }
  if (statut === 'pourvue' || statut === 'fermee') {
    if (dateCloture) return { datePublication, dateCloture };
    const cloture = datePublication && datePublication > today ? datePublication : today;
    return { datePublication, dateCloture: cloture };
  }
  return { datePublication, dateCloture };
}
