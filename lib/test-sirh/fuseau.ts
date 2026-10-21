/**
 * Heure légale de Paris (Europe/Paris) — fonctions PURES, sans `Intl` :
 * conversion déterministe (rendu serveur = hydratation client) entre une
 * date + heure saisies en heure de Paris et l'instant UTC stocké en base
 * (timestamptz : entretiens de recrutement, décisions, clôtures…).
 *
 * Règle européenne (directive 2000/84/CE) : l'heure d'été (UTC+2) court du
 * dernier dimanche de mars 01:00 UTC au dernier dimanche d'octobre 01:00 UTC ;
 * le reste de l'année, heure d'hiver (UTC+1).
 */

import type { IsoDate } from './calendrier';

const MS_PAR_MINUTE = 60_000;

/** Jour du mois du dernier dimanche de `mois` (1-12) de `annee`. */
function dernierDimanche(annee: number, mois: number): number {
  const dernierJour = new Date(Date.UTC(annee, mois, 0));
  return dernierJour.getUTCDate() - dernierJour.getUTCDay();
}

/** Décalage de Paris par rapport à UTC (minutes) à l'instant donné : 120 l'été, 60 l'hiver. */
export function decalageParisMinutes(instant: Date): number {
  const annee = instant.getUTCFullYear();
  const debutEte = Date.UTC(annee, 2, dernierDimanche(annee, 3), 1, 0, 0);
  const finEte = Date.UTC(annee, 9, dernierDimanche(annee, 10), 1, 0, 0);
  const t = instant.getTime();
  return t >= debutEte && t < finEte ? 120 : 60;
}

/**
 * Date `YYYY-MM-DD` + heure `HH:MM` exprimées en heure de Paris → instant ISO UTC.
 * Heure inexistante (passage à l'heure d'été) : décalée d'une heure ; heure
 * ambiguë (retour à l'heure d'hiver) : première occurrence.
 */
export function instantDepuisHeureParis(date: IsoDate, heure: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = heure.split(':').map(Number);
  if (!y || !m || !d || h === undefined || min === undefined || Number.isNaN(h + min)) {
    throw new Error(`Date ou heure invalide : ${date} ${heure}`);
  }
  const localCommeUtc = Date.UTC(y, m - 1, d, h, min);
  for (const decalage of [120, 60]) {
    const instant = new Date(localCommeUtc - decalage * MS_PAR_MINUTE);
    if (decalageParisMinutes(instant) === decalage) return instant.toISOString();
  }
  return new Date(localCommeUtc - 60 * MS_PAR_MINUTE).toISOString();
}

/** Instant (ISO ou `Date`) → date et heure de Paris (`YYYY-MM-DD`, `HH:MM`), ou `null`. */
export function dateHeureParis(
  instant: string | Date | null | undefined,
): { date: IsoDate; heure: string } | null {
  if (!instant) return null;
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() + decalageParisMinutes(d) * MS_PAR_MINUTE).toISOString();
  return { date: local.slice(0, 10), heure: local.slice(11, 16) };
}

/** Libellé d'un rendez-vous en heure de Paris : `20/10/2026 à 14:00` ; vide → `—`. */
export function formatEntretien(instant: string | Date | null | undefined): string {
  const local = dateHeureParis(instant);
  if (!local) return '—';
  const [y, m, d] = local.date.split('-');
  return `${d}/${m}/${y} à ${local.heure}`;
}
