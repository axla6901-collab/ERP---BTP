/**
 * Indicateurs d'avancement — module PUR (aucune I/O).
 *
 * - Progression d'une campagne : entretiens réalisés (ou signés) / entretiens
 *   non annulés.
 * - Atteinte des objectifs : moyenne des progressions pondérée par le poids
 *   (poids absent = 1 ; objectifs abandonnés exclus).
 */

import type { IsoDate } from '../calendrier';
import type { StatutEntretien, StatutObjectif } from '@/lib/validation/test-sirh/enums';

export type ProgressionCampagne = {
  /** Entretiens non annulés. */
  total: number;
  /** Entretiens réalisés ou signés. */
  realises: number;
  annules: number;
  /** Réalisés / total, en % arrondi (0 si aucun entretien). */
  pourcentage: number;
};

export function progressionCampagne(statuts: readonly StatutEntretien[]): ProgressionCampagne {
  let total = 0;
  let realises = 0;
  let annules = 0;
  for (const s of statuts) {
    if (s === 'annule') {
      annules += 1;
      continue;
    }
    total += 1;
    if (s === 'realise' || s === 'signe') realises += 1;
  }
  return {
    total,
    realises,
    annules,
    pourcentage: total > 0 ? Math.round((realises * 100) / total) : 0,
  };
}

export type ObjectifPourProgression = {
  poids: number | null;
  progression: number;
  statut: StatutObjectif;
};

/** Borne une progression saisie dans [0, 100]. */
function borner(p: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(p) ? p : 0));
}

/**
 * Atteinte globale des objectifs (en %, arrondie), pondérée par le poids.
 * `null` s'il n'y a aucun objectif pris en compte. Si tous les poids sont nuls,
 * repli sur la moyenne simple.
 */
export function progressionObjectifs(objectifs: readonly ObjectifPourProgression[]): number | null {
  const retenus = objectifs.filter((o) => o.statut !== 'abandonne');
  if (retenus.length === 0) return null;
  let somme = 0;
  let poidsTotal = 0;
  for (const o of retenus) {
    const poids = o.poids ?? 1;
    somme += poids * borner(o.progression);
    poidsTotal += poids;
  }
  if (poidsTotal > 0) return Math.round(somme / poidsTotal);
  const simple = retenus.reduce((acc, o) => acc + borner(o.progression), 0) / retenus.length;
  return Math.round(simple);
}

/** Objectif en cours dont l'échéance est dépassée. */
export function objectifEnRetard(
  o: { statut: StatutObjectif; dateEcheance: IsoDate | null },
  today: IsoDate,
): boolean {
  return o.statut === 'en_cours' && o.dateEcheance !== null && o.dateEcheance < today;
}
