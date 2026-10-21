/**
 * Machines à états des entretiens et des campagnes — module PUR (aucune I/O).
 *
 * Entretien : `a_planifier → planifie → realise → signe`, avec `annule` en
 * sortie latérale. Un entretien signé est verrouillé (compte rendu figé) ; un
 * entretien annulé peut être réactivé (retour « à planifier »).
 *
 * Campagne : `brouillon → en_cours` uniquement via « Lancer la campagne »
 * (génération des entretiens), puis `en_cours ⇄ cloturee`.
 */

import type { IsoDate } from '../calendrier';
import type { StatutCampagne, StatutEntretien } from '@/lib/validation/test-sirh/enums';

// ─────────────────────────────────────────────────────────────
// Entretiens
// ─────────────────────────────────────────────────────────────

/** Transitions autorisées (hors maintien du statut courant, toujours permis). */
export const TRANSITIONS_ENTRETIEN: Record<StatutEntretien, readonly StatutEntretien[]> = {
  a_planifier: ['planifie', 'realise', 'annule'],
  planifie: ['a_planifier', 'realise', 'annule'],
  realise: ['planifie', 'signe'],
  signe: [],
  annule: ['a_planifier'],
};

export function transitionEntretienAutorisee(de: StatutEntretien, vers: StatutEntretien): boolean {
  return de === vers || TRANSITIONS_ENTRETIEN[de].includes(vers);
}

/** Statuts proposables depuis `de` (statut courant en tête). */
export function statutsAccessiblesEntretien(de: StatutEntretien): StatutEntretien[] {
  return [de, ...TRANSITIONS_ENTRETIEN[de]];
}

/** Compte rendu figé : entretien signé ou annulé. */
export function compteRenduVerrouille(statut: StatutEntretien): boolean {
  return statut === 'signe' || statut === 'annule';
}

/** Un entretien tenu (réalisé / signé) est conservé : preuve de l'obligation légale. */
export function entretienSupprimable(statut: StatutEntretien): boolean {
  return statut !== 'realise' && statut !== 'signe';
}

export type IncoherenceEntretien = {
  champ: 'datePrevue' | 'dateRealisation';
  message: string;
};

/**
 * Cohérence statut ↔ dates (miroir applicatif du CHECK `chk_sirh_entretiens_realise`
 * complété de règles de saisie) ; `null` si cohérent.
 */
export function verifierCoherenceEntretien(e: {
  statut: StatutEntretien;
  datePrevue: IsoDate | null;
  dateRealisation: IsoDate | null;
}): IncoherenceEntretien | null {
  if ((e.statut === 'realise' || e.statut === 'signe') && !e.dateRealisation) {
    return {
      champ: 'dateRealisation',
      message: 'Date de réalisation requise pour un entretien réalisé ou signé.',
    };
  }
  if (e.statut === 'planifie' && !e.datePrevue) {
    return { champ: 'datePrevue', message: 'Date prévue requise pour un entretien planifié.' };
  }
  if (
    (e.statut === 'a_planifier' || e.statut === 'planifie' || e.statut === 'annule') &&
    e.dateRealisation
  ) {
    return {
      champ: 'dateRealisation',
      message: 'Date de réalisation renseignée : passez l’entretien en « Réalisé ».',
    };
  }
  return null;
}

/**
 * Statut après modification de la date prévue : une date posée sur un entretien
 * « à planifier » le planifie ; une date retirée d'un entretien « planifié » le
 * remet « à planifier ». Les autres statuts sont inchangés.
 */
export function statutApresPlanification(
  statut: StatutEntretien,
  datePrevue: IsoDate | null,
): StatutEntretien {
  if (statut === 'a_planifier' && datePrevue) return 'planifie';
  if (statut === 'planifie' && !datePrevue) return 'a_planifier';
  return statut;
}

// ─────────────────────────────────────────────────────────────
// Campagnes
// ─────────────────────────────────────────────────────────────

/** Transitions manuelles (le passage `brouillon → en_cours` se fait au lancement). */
export const TRANSITIONS_CAMPAGNE: Record<StatutCampagne, readonly StatutCampagne[]> = {
  brouillon: [],
  en_cours: ['cloturee'],
  cloturee: ['en_cours'],
};

export function transitionCampagneAutorisee(de: StatutCampagne, vers: StatutCampagne): boolean {
  return TRANSITIONS_CAMPAGNE[de].includes(vers);
}

/** Le lancement (génération idempotente des entretiens) est possible tant que la campagne n'est pas clôturée. */
export function campagneLancable(statut: StatutCampagne): boolean {
  return statut === 'brouillon' || statut === 'en_cours';
}
