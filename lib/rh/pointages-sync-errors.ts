/**
 * Classification des erreurs Postgres levées pendant la synchronisation d'un
 * pointage offline (M5.5). **Module pur** (aucun import server-only) pour être
 * testable et réutilisable.
 *
 * Mappe un SQLSTATE + nom de contrainte vers une raison de rejet `outbox` afin
 * que le client sache s'il doit abandonner (rejet définitif) ou laisser remonter
 * une erreur inattendue (réessai / 500).
 */

import type { SyncRejectReason } from '@/lib/pwa/types';

/** Forme minimale d'une erreur postgres-js (PostgresError). */
type PgErrorLike = {
  code?: unknown;
  constraint_name?: unknown;
};

function asPgError(err: unknown): PgErrorLike | null {
  if (typeof err !== 'object' || err === null) return null;
  return err as PgErrorLike;
}

/**
 * Retourne la raison de rejet correspondant à l'erreur Postgres, ou `null` si
 * l'erreur n'est pas une violation de contrainte attendue (→ l'appelant doit la
 * laisser remonter comme erreur serveur).
 *
 * - `23505` unique_violation → `doublon_metier`
 * - `23503` foreign_key_violation → `reference_supprimee`
 * - `23514` check_violation → `donnees_invalides`
 */
export function classifyPointageSyncError(err: unknown): SyncRejectReason | null {
  const pg = asPgError(err);
  const code = typeof pg?.code === 'string' ? pg.code : null;
  if (!code) return null;

  switch (code) {
    case '23505': // unique_violation
      // L'unicité sur client_uuid est absorbée par ON CONFLICT (DO NOTHING) ;
      // une 23505 qui remonte vient donc forcément de l'unicité métier
      // (employé, date, chantier, type) → un autre appareil a déjà pointé ça.
      return 'doublon_metier';
    case '23503': // foreign_key_violation
      return 'reference_supprimee';
    case '23514': // check_violation
      return 'donnees_invalides';
    default:
      return null;
  }
}

/** Message lisible (FR) associé à une raison de rejet. */
export function messagePourRejet(reason: SyncRejectReason): string {
  switch (reason) {
    case 'doublon_metier':
      return 'Un pointage existe déjà pour cet employé, cette date et ce chantier.';
    case 'reference_supprimee':
      return "Le chantier, la tâche ou l'employé a été supprimé entre-temps.";
    case 'donnees_invalides':
      return 'Données du pointage invalides.';
  }
}
