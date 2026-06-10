/**
 * Fonctions de calcul PURES du dashboard chantier-first.
 *
 * Aucune dépendance React / DOM / Drizzle : 100 % testable côté unitaire.
 * Convention dates : strings ISO `AAAA-MM-JJ`. Les calculs temporels passent
 * par `Date.parse(iso + 'T00:00:00Z')` (UTC) pour rester indépendants du
 * fuseau du serveur — deux dates calendaires identiques donnent toujours le
 * même résultat, où que tourne le process.
 */

import type { BadgeTone } from '@/components/ui/badge';
import type { StatutChantier } from '@/lib/validation/chantiers';

const MS_PAR_JOUR = 86_400_000;

/** Parse une date ISO `AAAA-MM-JJ` en epoch ms UTC, ou `NaN` si invalide. */
function epochUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Formate une `Date` en ISO `AAAA-MM-JJ` (composantes UTC). */
function isoUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

// ─────────────────────────────────────────────────────────────
// Reste à faire / livraison
// ─────────────────────────────────────────────────────────────

/**
 * Nombre de jours calendaires entre `todayIso` et `dateFinIso`.
 * `> 0` = jours restants, `0` = échéance aujourd'hui, `< 0` = retard.
 * `null` si la date de fin est absente/invalide.
 */
export function joursRestants(dateFinIso: string | null, todayIso: string): number | null {
  if (!dateFinIso) return null;
  const fin = epochUtc(dateFinIso);
  const today = epochUtc(todayIso);
  if (Number.isNaN(fin) || Number.isNaN(today)) return null;
  return Math.round((fin - today) / MS_PAR_JOUR);
}

/** Un chantier non terminé dont la fin prévue est dépassée est « en retard ». */
export function estEnRetard(
  statut: StatutChantier,
  dateFinIso: string | null,
  todayIso: string,
): boolean {
  if (statut === 'termine' || statut === 'annule') return false;
  const restant = joursRestants(dateFinIso, todayIso);
  return restant !== null && restant < 0;
}

// ─────────────────────────────────────────────────────────────
// Coût main-d'œuvre & marge
// ─────────────────────────────────────────────────────────────

/**
 * Coût main-d'œuvre réel = Σ (heures pointées × taux horaire brut).
 * Les lignes sans taux horaire connu sont ignorées (impossible à valoriser).
 */
export function coutMainOeuvre(
  lignes: ReadonlyArray<{ heures: number; tauxHoraireBrut: number | null }>,
): number {
  let total = 0;
  for (const l of lignes) {
    if (l.tauxHoraireBrut == null || Number.isNaN(l.tauxHoraireBrut)) continue;
    total += l.heures * l.tauxHoraireBrut;
  }
  return Math.round(total * 100) / 100;
}

export type MargeChantier = {
  /** Montant prévisionnel HT (budget), ou `null` si non renseigné. */
  montantPrevisionnel: number | null;
  /** Coût main-d'œuvre réel valorisé (heures × taux). */
  coutMainOeuvre: number;
  /** Marge brute = prévisionnel − coût MO. `null` si pas de prévisionnel. */
  marge: number | null;
  /** Marge en % du prévisionnel (1 décimale). `null` si prévisionnel nul/absent. */
  margePct: number | null;
};

/**
 * Marge brute « hors achats & sous-traitance » : il n'existe pas (encore) de
 * table de coûts achats/ST par chantier, donc seul le coût main-d'œuvre est
 * déduit. À compléter quand ces modules existeront.
 */
export function calculerMarge(montantPrevisionnel: number | null, coutMO: number): MargeChantier {
  if (montantPrevisionnel == null || Number.isNaN(montantPrevisionnel)) {
    return { montantPrevisionnel: null, coutMainOeuvre: coutMO, marge: null, margePct: null };
  }
  const marge = montantPrevisionnel - coutMO;
  const margePct = montantPrevisionnel !== 0 ? (marge / montantPrevisionnel) * 100 : null;
  return {
    montantPrevisionnel,
    coutMainOeuvre: coutMO,
    marge: Math.round(marge * 100) / 100,
    margePct: margePct === null ? null : Math.round(margePct * 10) / 10,
  };
}

// ─────────────────────────────────────────────────────────────
// Semaine ISO (lundi → dimanche)
// ─────────────────────────────────────────────────────────────

/** Bornes ISO de la semaine (lundi→dimanche) contenant `todayIso`. */
export function bornesSemaine(todayIso: string): { debut: string; fin: string } {
  const d = new Date(epochUtc(todayIso));
  const jour = d.getUTCDay(); // 0 = dimanche … 6 = samedi
  const depuisLundi = (jour + 6) % 7;
  const lundi = new Date(d);
  lundi.setUTCDate(d.getUTCDate() - depuisLundi);
  const dimanche = new Date(lundi);
  dimanche.setUTCDate(lundi.getUTCDate() + 6);
  return { debut: isoUtc(lundi), fin: isoUtc(dimanche) };
}

// ─────────────────────────────────────────────────────────────
// Frise temporelle (mini-Gantt multi-chantiers)
// ─────────────────────────────────────────────────────────────

export type MoisFrise = { cle: string; label: string; leftPct: number; widthPct: number };

export type Frise = {
  /** 1er jour du mois le plus ancien affiché (ISO). */
  debut: string;
  /** Dernier jour du mois le plus récent affiché (ISO). */
  fin: string;
  /** Segments mensuels avec leur position en % (en-tête de frise). */
  mois: MoisFrise[];
};

const LIBELLES_MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/**
 * Construit la frise des mois autour de `todayIso` : de `moisAvant` mois avant
 * le mois courant à `moisApres` mois après, bornée aux 1er/dernier jours de
 * mois. Chaque segment porte sa largeur proportionnelle (en jours).
 */
export function genererFrise(todayIso: string, moisAvant = 1, moisApres = 1): Frise {
  const t = new Date(epochUtc(todayIso));
  const anneeBase = t.getUTCFullYear();
  const moisBase = t.getUTCMonth();

  const debutDate = new Date(Date.UTC(anneeBase, moisBase - moisAvant, 1));
  // 1er jour du mois APRÈS le dernier mois affiché, puis −1 jour = dernier jour.
  const finExclusive = new Date(Date.UTC(anneeBase, moisBase + moisApres + 1, 1));
  const finDate = new Date(finExclusive.getTime() - MS_PAR_JOUR);

  const debut = isoUtc(debutDate);
  const fin = isoUtc(finDate);
  const spanJours = Math.round((finExclusive.getTime() - debutDate.getTime()) / MS_PAR_JOUR);

  const mois: MoisFrise[] = [];
  const nbMois = moisAvant + 1 + moisApres;
  for (let i = 0; i < nbMois; i++) {
    const segDebut = new Date(Date.UTC(anneeBase, moisBase - moisAvant + i, 1));
    const segFinExcl = new Date(Date.UTC(anneeBase, moisBase - moisAvant + i + 1, 1));
    const offsetJours = Math.round((segDebut.getTime() - debutDate.getTime()) / MS_PAR_JOUR);
    const dureeJours = Math.round((segFinExcl.getTime() - segDebut.getTime()) / MS_PAR_JOUR);
    mois.push({
      cle: `${segDebut.getUTCFullYear()}-${segDebut.getUTCMonth()}`,
      label: `${LIBELLES_MOIS[segDebut.getUTCMonth()]} ${segDebut.getUTCFullYear()}`,
      leftPct: (offsetJours / spanJours) * 100,
      widthPct: (dureeJours / spanJours) * 100,
    });
  }

  return { debut, fin, mois };
}

/**
 * Position d'une barre (chantier/tâche) sur la frise, en % `[0..100]`.
 * Clampe aux bornes de la frise et garantit une largeur minimale visible.
 * `null` si pas de dates, frise dégénérée, ou intervalle entièrement hors frise.
 */
export function positionBarre(
  debutIso: string | null,
  finIso: string | null,
  friseDebutIso: string,
  friseFinIso: string,
  largeurMinPct = 2,
): { leftPct: number; widthPct: number } | null {
  if (!debutIso || !finIso) return null;
  const t0 = epochUtc(friseDebutIso);
  const t1 = epochUtc(friseFinIso) + MS_PAR_JOUR; // borne de fin inclusive
  const span = t1 - t0;
  if (!(span > 0)) return null;
  const d0 = epochUtc(debutIso);
  const d1 = epochUtc(finIso) + MS_PAR_JOUR; // la barre couvre tout son dernier jour
  if (Number.isNaN(d0) || Number.isNaN(d1)) return null;
  const start = Math.max(d0, t0);
  const end = Math.min(d1, t1);
  if (end <= t0 || start >= t1) return null; // hors frise
  const leftPct = clamp(((start - t0) / span) * 100, 0, 100);
  const brut = ((end - start) / span) * 100;
  const widthPct = clamp(Math.max(brut, largeurMinPct), 0, 100 - leftPct);
  return { leftPct, widthPct };
}

// ─────────────────────────────────────────────────────────────
// Mapping statut → ton de badge / barre (aligné maquette M1)
// ─────────────────────────────────────────────────────────────

/** Ton de Badge pour un statut chantier (maquette : « en cours » = amber). */
export function toneStatutChantier(statut: StatutChantier): BadgeTone {
  switch (statut) {
    case 'en_cours':
      return 'amber';
    case 'prospect':
      return 'neutral';
    case 'suspendu':
      return 'orange';
    case 'termine':
      return 'emerald';
    case 'annule':
      return 'rose';
  }
}

export type CouleurBarre = 'amber' | 'sky' | 'orange' | 'emerald' | 'rose' | 'neutral';

/** Couleur d'une barre de timeline : le retard prime sur le statut (rose ⚠). */
export function couleurBarre(statut: StatutChantier, enRetard: boolean): CouleurBarre {
  if (enRetard) return 'rose';
  switch (statut) {
    case 'en_cours':
      return 'amber';
    case 'prospect':
      return 'sky';
    case 'suspendu':
      return 'orange';
    case 'termine':
      return 'emerald';
    case 'annule':
      return 'neutral';
  }
}
