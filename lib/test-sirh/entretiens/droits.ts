import 'server-only';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import type { TenantTx } from '@/lib/db/with-tenant';

import { employeIdDeLUtilisateur } from '../acces';
import { peutGererSirh } from '../permissions';

/**
 * Droits fins des domaines Entretiens et Formation (à appeler DANS `withTenant`).
 *
 * - Écriture d'un entretien (compte rendu, objectifs rattachés) : gestionnaire
 *   RH, ou évaluateur de l'entretien (employé lié à l'utilisateur courant).
 * - Consultation des données d'un salarié (dossier, « Mon espace ») : rôles de
 *   lecture du SIRH, ou le salarié lui-même.
 */

/** L'utilisateur courant est-il l'évaluateur désigné ? */
export async function estEvaluateur(
  tx: TenantTx,
  ctx: TenantContext,
  evaluateurId: string | null,
): Promise<boolean> {
  if (!evaluateurId) return false;
  const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
  return moi !== null && moi === evaluateurId;
}

/** RH (gestion) ou évaluateur de l'entretien. */
export async function peutEcrireEntretien(
  tx: TenantTx,
  ctx: TenantContext,
  entretien: { evaluateurId: string | null },
): Promise<boolean> {
  if (peutGererSirh(ctx.utilisateur.role)) return true;
  return estEvaluateur(tx, ctx, entretien.evaluateurId);
}

/** Rôle de lecture SIRH, ou le salarié lui-même (désormais dans le socle). */
export { peutConsulterEmploye } from '../acces';
