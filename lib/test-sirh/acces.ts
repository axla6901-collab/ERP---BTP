import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import type { TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { utilisateurs } from '@/db/schema/utilisateurs';

import { peutGererSirh, peutLireSirh } from './permissions';

/**
 * Accès « libre-service » du SIRH : un salarié n'agit que pour SA fiche employé.
 *
 * Le rattachement utilisateur ↔ employé fait foi via `employes.utilisateur_id`
 * (table tenant, filtrée par la RLS). Repli : `utilisateurs.employe_id` (table
 * globale), à condition que l'employé appartienne bien au tenant courant.
 *
 * Toutes ces fonctions s'exécutent DANS une transaction `withTenant` (RLS posée).
 */

/** Identifiant de l'employé rattaché à l'utilisateur, ou `null`. */
export async function employeIdDeLUtilisateur(
  tx: TenantTx,
  utilisateurId: string,
): Promise<string | null> {
  const [direct] = await tx
    .select({ id: employes.id })
    .from(employes)
    .where(and(eq(employes.utilisateurId, utilisateurId), isNull(employes.deletedAt)))
    .limit(1);
  if (direct) return direct.id;

  const [compte] = await tx
    .select({ employeId: utilisateurs.employeId })
    .from(utilisateurs)
    .where(eq(utilisateurs.id, utilisateurId))
    .limit(1);
  if (!compte?.employeId) return null;

  // La RLS garantit que l'employé lu appartient au tenant courant.
  const [viaCompte] = await tx
    .select({ id: employes.id })
    .from(employes)
    .where(and(eq(employes.id, compte.employeId), isNull(employes.deletedAt)))
    .limit(1);
  return viaCompte?.id ?? null;
}

/** L'employé existe (non supprimé) dans le tenant courant. */
export async function employeExiste(tx: TenantTx, employeId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: employes.id })
    .from(employes)
    .where(and(eq(employes.id, employeId), isNull(employes.deletedAt)))
    .limit(1);
  return Boolean(row);
}

/**
 * L'utilisateur courant peut-il agir pour `employeId` ?
 * Oui s'il gère le SIRH (admin/RH), ou s'il s'agit de sa propre fiche.
 */
export async function peutAgirPourEmploye(
  tx: TenantTx,
  ctx: TenantContext,
  employeId: string,
): Promise<boolean> {
  if (!(await employeExiste(tx, employeId))) return false;
  if (peutGererSirh(ctx.utilisateur.role)) return true;
  const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
  return moi === employeId;
}

/**
 * L'utilisateur courant peut-il CONSULTER les données SIRH de `employeId` ?
 * Oui s'il a un rôle de lecture du SIRH, ou s'il s'agit de sa propre fiche
 * (dossier collaborateur, « Mon espace »). `false` si l'employé n'existe pas.
 */
export async function peutConsulterEmploye(
  tx: TenantTx,
  ctx: TenantContext,
  employeId: string,
): Promise<boolean> {
  if (!(await employeExiste(tx, employeId))) return false;
  if (peutLireSirh(ctx.utilisateur.role)) return true;
  const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
  return moi === employeId;
}
