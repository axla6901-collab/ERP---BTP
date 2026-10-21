/**
 * Périodes de paie mensuelles — logique PURE (aucune I/O), importable côté
 * client comme serveur. Équivalent fonctionnel de Factorial `payroll/PolicyPeriod`
 * + `compensations/PayrollRun` : un mois de paie et son cycle de vie
 * `ouverte → en_controle → cloturee` (réouverture réservée aux gestionnaires RH).
 */

import {
  ajouterJours,
  dernierJourDuMois,
  estDateIso,
  premierJourDuMois,
  type IsoDate,
} from '../calendrier';
import { formatMois } from '../format';
import type { StatutPeriodePaie } from '@/lib/validation/test-sirh/enums';

/** Un mois de paie (mois 1 → 12). */
export type MoisPaie = { annee: number; mois: number };

// ─────────────────────────────────────────────────────────────
// Arithmétique des mois
// ─────────────────────────────────────────────────────────────

export function periodeSuivante(p: MoisPaie): MoisPaie {
  return p.mois === 12 ? { annee: p.annee + 1, mois: 1 } : { annee: p.annee, mois: p.mois + 1 };
}

export function periodePrecedente(p: MoisPaie): MoisPaie {
  return p.mois === 1 ? { annee: p.annee - 1, mois: 12 } : { annee: p.annee, mois: p.mois - 1 };
}

/** Comparaison chronologique (< 0 si `a` est antérieur à `b`). */
export function comparerMois(a: MoisPaie, b: MoisPaie): number {
  return a.annee !== b.annee ? a.annee - b.annee : a.mois - b.mois;
}

export function memeMois(a: MoisPaie, b: MoisPaie): boolean {
  return a.annee === b.annee && a.mois === b.mois;
}

/** Premier et dernier jour du mois (ISO). */
export function bornesMois(p: MoisPaie): { debut: IsoDate; fin: IsoDate } {
  return { debut: premierJourDuMois(p.annee, p.mois), fin: dernierJourDuMois(p.annee, p.mois) };
}

/** Mois contenant la date ISO. */
export function moisDeLaDate(iso: IsoDate): MoisPaie {
  return { annee: Number(iso.slice(0, 4)), mois: Number(iso.slice(5, 7)) };
}

/** `{2026, 3}` → `2026-03` (paramètre d'URL `?mois=`). */
export function parametreMois(p: MoisPaie): string {
  return `${p.annee}-${String(p.mois).padStart(2, '0')}`;
}

/**
 * Lit un paramètre d'URL `YYYY-MM` ; valeur absente ou invalide → mois de
 * `aujourdhui`.
 */
export function moisDepuisParametre(
  param: string | null | undefined,
  aujourdhui: IsoDate,
): MoisPaie {
  const m = /^(\d{4})-(\d{2})$/.exec(param?.trim() ?? '');
  if (m) {
    const annee = Number(m[1]);
    const mois = Number(m[2]);
    if (annee >= 2000 && annee <= 2100 && mois >= 1 && mois <= 12) return { annee, mois };
  }
  return moisDeLaDate(estDateIso(aujourdhui) ? aujourdhui : '2000-01-01');
}

/** Libellé de titre : `Octobre 2026`. */
export function libellePeriode(p: MoisPaie): string {
  const l = formatMois(p.annee, p.mois);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** La date ISO tombe-t-elle dans le mois ? */
export function dateDansMois(iso: IsoDate, p: MoisPaie): boolean {
  const { debut, fin } = bornesMois(p);
  return iso >= debut && iso <= fin;
}

/**
 * Mois proposé à la création d'une période : le mois courant s'il n'existe pas
 * encore, sinon le premier mois suivant non créé.
 */
export function proposerNouvellePeriode(
  existantes: readonly MoisPaie[],
  aujourdhui: IsoDate,
): MoisPaie {
  let candidat = moisDeLaDate(aujourdhui);
  // Borne de sécurité : 20 ans de périodes créées d'avance.
  for (let i = 0; i < 240 && existantes.some((e) => memeMois(e, candidat)); i++) {
    candidat = periodeSuivante(candidat);
  }
  return candidat;
}

/** Nombre de jours calendaires du mois. */
export function joursDansMois(p: MoisPaie): number {
  const { debut, fin } = bornesMois(p);
  return Number(fin.slice(8, 10)) - Number(debut.slice(8, 10)) + 1;
}

/** Lendemain du dernier jour du mois (utile pour borner les requêtes « < »). */
export function lendemainFinMois(p: MoisPaie): IsoDate {
  return ajouterJours(bornesMois(p).fin, 1);
}

// ─────────────────────────────────────────────────────────────
// Cycle de vie d'une période
// ─────────────────────────────────────────────────────────────

/** Transitions autorisées depuis chaque statut. */
export const TRANSITIONS_PERIODE: Readonly<
  Record<StatutPeriodePaie, readonly StatutPeriodePaie[]>
> = {
  ouverte: ['en_controle'],
  en_controle: ['ouverte', 'cloturee'],
  cloturee: ['ouverte'],
};

export type TransitionPeriode = {
  vers: StatutPeriodePaie;
  libelle: string;
  question: string;
  /** Réservée aux gestionnaires RH (réouverture d'une période clôturée). */
  reserveeGestion: boolean;
};

const LIBELLES_TRANSITION: Record<string, { libelle: string; question: string }> = {
  'ouverte>en_controle': {
    libelle: 'Passer en contrôle',
    question: 'Passer la période en contrôle ?',
  },
  'en_controle>ouverte': {
    libelle: 'Revenir en saisie',
    question: 'Rouvrir la saisie des variables ?',
  },
  'en_controle>cloturee': {
    libelle: 'Clôturer la période',
    question: 'Clôturer la période ? Elle passera en lecture seule.',
  },
  'cloturee>ouverte': {
    libelle: 'Rouvrir la période',
    question: 'Rouvrir une période clôturée ?',
  },
};

function estReserveeGestion(de: StatutPeriodePaie, vers: StatutPeriodePaie): boolean {
  return de === 'cloturee' && vers === 'ouverte';
}

/** Transitions proposées à l'utilisateur pour une période au statut donné. */
export function transitionsPeriode(
  statut: StatutPeriodePaie,
  opts: { peutGerer: boolean },
): TransitionPeriode[] {
  return TRANSITIONS_PERIODE[statut]
    .filter((vers) => opts.peutGerer || !estReserveeGestion(statut, vers))
    .map((vers) => {
      const l = LIBELLES_TRANSITION[`${statut}>${vers}`];
      return {
        vers,
        libelle: l?.libelle ?? vers,
        question: l?.question ?? 'Confirmer ?',
        reserveeGestion: estReserveeGestion(statut, vers),
      };
    });
}

/**
 * Vérifie une transition de statut. Renvoie `null` si elle est permise, sinon
 * le message d'erreur à afficher.
 */
export function verifierTransitionPeriode(
  de: StatutPeriodePaie,
  vers: StatutPeriodePaie,
  opts: { peutGerer: boolean },
): string | null {
  if (de === vers) return 'La période est déjà dans ce statut.';
  if (!TRANSITIONS_PERIODE[de].includes(vers)) {
    if (de === 'ouverte' && vers === 'cloturee') {
      return 'Passez d’abord la période en contrôle avant de la clôturer.';
    }
    return 'Changement de statut non autorisé.';
  }
  if (estReserveeGestion(de, vers) && !opts.peutGerer) {
    return 'Seuls les gestionnaires RH peuvent rouvrir une période clôturée.';
  }
  return null;
}

/** Une période clôturée est en lecture seule (variables figées). */
export function periodeModifiable(statut: StatutPeriodePaie): boolean {
  return statut !== 'cloturee';
}
