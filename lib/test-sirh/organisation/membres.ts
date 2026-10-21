/**
 * Appartenance aux équipes (Factorial teams/Membership) — fonctions PURES,
 * importables côté client comme serveur.
 *
 * Une appartenance est bornée par `dateDebut` / `dateFin` (inclusives, NULL =
 * non bornée). Le retrait d'un membre est un soft-delete : les lignes reçues
 * ici sont supposées non supprimées.
 */

import type { IsoDate } from '../calendrier';

export type PeriodeMembre = { dateDebut: IsoDate | null; dateFin: IsoDate | null };

export type StatutMembre = 'a_venir' | 'actif' | 'termine';

export const LIBELLES_STATUT_MEMBRE: Record<StatutMembre, string> = {
  a_venir: 'À venir',
  actif: 'Actif',
  termine: 'Terminé',
};

/** Statut d'une appartenance à la date `today`. */
export function statutMembre(m: PeriodeMembre, today: IsoDate): StatutMembre {
  if (m.dateFin && m.dateFin < today) return 'termine';
  if (m.dateDebut && m.dateDebut > today) return 'a_venir';
  return 'actif';
}

/** L'appartenance couvre-t-elle la date `today` ? */
export function membreActif(m: PeriodeMembre, today: IsoDate): boolean {
  return statutMembre(m, today) === 'actif';
}

/**
 * Appartenance « en vigueur » au sens du garde-fou de suppression : actuelle
 * ou à venir (non terminée). Même règle que la requête SQL
 * `date_fin IS NULL OR date_fin >= today`.
 */
export function membreNonTermine(m: PeriodeMembre, today: IsoDate): boolean {
  return statutMembre(m, today) !== 'termine';
}

/** Effectif d'une équipe à `today` : membres actifs, chaque employé compté une fois. */
export function effectifEquipe(
  membres: ReadonlyArray<PeriodeMembre & { employeId: string }>,
  today: IsoDate,
): number {
  const presents = new Set<string>();
  for (const m of membres) if (membreActif(m, today)) presents.add(m.employeId);
  return presents.size;
}
