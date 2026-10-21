/**
 * Visibilité des annonces internes (Factorial posts) — module PUR (aucune
 * I/O), importable côté client comme serveur.
 *
 * - Statut dérivé des dates et de la publication : brouillon, programmée,
 *   en ligne, expirée.
 * - Audience : `siteId` et `equipeId` nuls = toute l'entreprise ; un critère
 *   renseigné restreint l'annonce au site / à l'équipe du collaborateur lié à
 *   l'utilisateur ; deux critères renseignés se cumulent (membres de l'équipe
 *   rattachés au site).
 * - Tri du fil : épinglées d'abord, puis publication la plus récente.
 */

import type { IsoDate } from '../calendrier';

export type StatutAnnonce = 'brouillon' | 'programmee' | 'en_ligne' | 'expiree';

export const STATUTS_ANNONCE: readonly StatutAnnonce[] = [
  'en_ligne',
  'programmee',
  'brouillon',
  'expiree',
];

export const LIBELLES_STATUT_ANNONCE: Record<StatutAnnonce, string> = {
  en_ligne: 'En ligne',
  programmee: 'Programmée',
  brouillon: 'Brouillon',
  expiree: 'Expirée',
};

export type DatesAnnonce = {
  publiee: boolean;
  datePublication: IsoDate;
  dateExpiration: IsoDate | null;
};

/** Statut d'une annonce à la date `today` (expiration incluse : visible jusqu'au jour J). */
export function statutAnnonce(a: DatesAnnonce, today: IsoDate): StatutAnnonce {
  if (!a.publiee) return 'brouillon';
  if (a.datePublication > today) return 'programmee';
  if (a.dateExpiration !== null && a.dateExpiration < today) return 'expiree';
  return 'en_ligne';
}

export function estAnnonceEnLigne(a: DatesAnnonce, today: IsoDate): boolean {
  return statutAnnonce(a, today) === 'en_ligne';
}

// ─────────────────────────────────────────────────────────────
// Audience
// ─────────────────────────────────────────────────────────────

export type AudienceAnnonce = { siteId: string | null; equipeId: string | null };

/** Rattachements du collaborateur lié à l'utilisateur (null : aucun collaborateur lié). */
export type ProfilAudience = { siteId: string | null; equipeIds: readonly string[] };

export function estPourToutLeMonde(a: AudienceAnnonce): boolean {
  return a.siteId === null && a.equipeId === null;
}

/** L'utilisateur fait-il partie de l'audience de l'annonce ? */
export function estDansAudience(a: AudienceAnnonce, profil: ProfilAudience | null): boolean {
  if (estPourToutLeMonde(a)) return true;
  if (!profil) return false;
  if (a.siteId !== null && profil.siteId !== a.siteId) return false;
  if (a.equipeId !== null && !profil.equipeIds.includes(a.equipeId)) return false;
  return true;
}

/** Appartenance d'équipe en vigueur à `today` (bornes facultatives, incluses). */
export function adhesionActive(
  m: { dateDebut: IsoDate | null; dateFin: IsoDate | null },
  today: IsoDate,
): boolean {
  if (m.dateDebut !== null && m.dateDebut > today) return false;
  if (m.dateFin !== null && m.dateFin < today) return false;
  return true;
}

/** Libellé d'audience : « Toute l'entreprise », « Équipe X », « Site Y », « Équipe X · Site Y ». */
export function libelleAudience(a: { siteNom: string | null; equipeNom: string | null }): string {
  const parties = [
    a.equipeNom ? `Équipe ${a.equipeNom}` : null,
    a.siteNom ? `Site ${a.siteNom}` : null,
  ].filter((p): p is string => p !== null);
  return parties.length > 0 ? parties.join(' · ') : 'Toute l’entreprise';
}

// ─────────────────────────────────────────────────────────────
// Tri, filtres
// ─────────────────────────────────────────────────────────────

export type AnnonceTriable = { epinglee: boolean; datePublication: IsoDate; createdAt?: string };

/** Épinglées d'abord, puis date de publication décroissante, puis création décroissante. */
export function comparerAnnonces(a: AnnonceTriable, b: AnnonceTriable): number {
  if (a.epinglee !== b.epinglee) return a.epinglee ? -1 : 1;
  if (a.datePublication !== b.datePublication) {
    return a.datePublication > b.datePublication ? -1 : 1;
  }
  const ca = a.createdAt ?? '';
  const cb = b.createdAt ?? '';
  if (ca !== cb) return ca > cb ? -1 : 1;
  return 0;
}

export function trierAnnonces<T extends AnnonceTriable>(annonces: readonly T[]): T[] {
  return [...annonces].sort(comparerAnnonces);
}

/**
 * Fil d'actualité d'un utilisateur : annonces en ligne dont il fait partie de
 * l'audience, triées (épinglées puis plus récentes), tronqué à `limite`.
 */
export function annoncesVisibles<T extends DatesAnnonce & AudienceAnnonce & AnnonceTriable>(
  annonces: readonly T[],
  profil: ProfilAudience | null,
  today: IsoDate,
  limite?: number,
): T[] {
  const visibles = trierAnnonces(
    annonces.filter((a) => estAnnonceEnLigne(a, today) && estDansAudience(a, profil)),
  );
  return limite !== undefined && limite >= 0 ? visibles.slice(0, limite) : visibles;
}

export type FiltreStatutAnnonce = StatutAnnonce | 'toutes';

export function filtrerAnnoncesParStatut<T extends DatesAnnonce>(
  annonces: readonly T[],
  filtre: FiltreStatutAnnonce,
  today: IsoDate,
): T[] {
  if (filtre === 'toutes') return [...annonces];
  return annonces.filter((a) => statutAnnonce(a, today) === filtre);
}

export function compterParStatut(
  annonces: readonly DatesAnnonce[],
  today: IsoDate,
): Record<StatutAnnonce, number> {
  const compte: Record<StatutAnnonce, number> = {
    en_ligne: 0,
    programmee: 0,
    brouillon: 0,
    expiree: 0,
  };
  for (const a of annonces) compte[statutAnnonce(a, today)] += 1;
  return compte;
}
