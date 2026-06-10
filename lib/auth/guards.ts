import 'server-only';

import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { db } from '@/lib/db/client';
import { permissions, rolePermissions, roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';

import { auth } from './server';
import { ROLES_MFA_OBLIGATOIRE, isRole, type Role } from './rbac';

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export type UtilisateurCourant = {
  id: string;
  name: string;
  email: string;
  /** Code du rôle (compat : si rôle système, typé `Role`, sinon string brut). */
  role: Role;
  roleId: string;
  roleCode: string;
  roleLibelle: string;
  employeId: string | null;
  actif: boolean;
  twoFactorEnabled: boolean;
  /**
   * Flag super-admin. Permet l'accès à la console `/admin/*` (provisioning
   * d'entreprises, audit cross-tenant). Orthogonal au RBAC tenant : un
   * super-admin reste soumis aux rôles applicatifs dans le contexte d'une
   * entreprise donnée.
   */
  isSuperAdmin: boolean;
};

export async function getCurrentUtilisateur(): Promise<UtilisateurCourant | null> {
  const session = await getSession();
  if (!session) return null;

  const [row] = await db
    .select({
      id: utilisateurs.id,
      email: utilisateurs.email,
      roleId: utilisateurs.roleId,
      roleCode: roles.code,
      roleLibelle: roles.libelle,
      employeId: utilisateurs.employeId,
      actif: utilisateurs.actif,
      isSuperAdmin: utilisateurs.isSuperAdmin,
    })
    .from(utilisateurs)
    .innerJoin(roles, eq(roles.id, utilisateurs.roleId))
    .where(eq(utilisateurs.id, session.user.id))
    .limit(1);

  if (!row) return null;

  // Pour la rétro-compatibilité avec les helpers `peut*(role: Role)`, on
  // expose le code dans `role` typé `Role`. Si le code n'est pas un rôle
  // système (rôle custom créé via UI), on retombe sur `lecture_seule` pour
  // garantir un accès minimal — la phase L2 introduira la vérification par
  // permissions atomiques qui rendra ce fallback inutile.
  const roleAsCompat: Role = isRole(row.roleCode) ? row.roleCode : 'lecture_seule';

  return {
    id: row.id,
    name: session.user.name,
    email: row.email,
    role: roleAsCompat,
    roleId: row.roleId,
    roleCode: row.roleCode,
    roleLibelle: row.roleLibelle,
    employeId: row.employeId,
    actif: row.actif,
    twoFactorEnabled: session.user.twoFactorEnabled ?? false,
    isSuperAdmin: row.isSuperAdmin,
  };
}

export async function requireAuth(role?: Role | readonly Role[]): Promise<UtilisateurCourant> {
  const utilisateur = await getCurrentUtilisateur();
  if (!utilisateur || !utilisateur.actif) {
    redirect('/login');
  }
  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes(utilisateur.role)) {
      redirect('/');
    }
  }
  return utilisateur;
}

/**
 * Identique à `requireAuth` mais avec un check supplémentaire : si le rôle
 * de l'utilisateur impose la MFA (cf. `ROLES_MFA_OBLIGATOIRE`) et qu'elle
 * n'est pas activée, redirige vers `/profile/mfa/setup`.
 *
 * À utiliser sur **toutes les pages métier**. Les pages de configuration MFA
 * elles-mêmes (`/profile/mfa`, `/profile/mfa/setup`) restent sur `requireAuth()`
 * pour ne pas créer de boucle de redirection.
 */
export async function requireAuthWithMfa(
  role?: Role | readonly Role[],
): Promise<UtilisateurCourant> {
  const utilisateur = await requireAuth(role);
  if (ROLES_MFA_OBLIGATOIRE.includes(utilisateur.role) && !utilisateur.twoFactorEnabled) {
    redirect('/profile/mfa/setup');
  }
  return utilisateur;
}

/**
 * Vérifie qu'un utilisateur (rôle) détient une permission atomique précise
 * via la table `role_permissions` (RBAC L2). À utiliser pour les server
 * actions / pages cuvant un droit cochable dans /administration/roles.
 *
 * Les rôles `admin` (système) ont toujours toutes les permissions par seed,
 * mais on ne court-circuite pas le check : si un futur garde-fou retirait
 * une perm, le comportement resterait conforme à la matrice.
 */
export async function aPermission(roleId: string, code: string): Promise<boolean> {
  const [row] = await db
    .select({ id: rolePermissions.permissionId })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(rolePermissions.roleId, roleId), eq(permissions.code, code)))
    .limit(1);
  return Boolean(row);
}

/**
 * Identique à `requireAuthWithMfa` mais vérifie en plus une permission
 * atomique (RBAC L2). Throw si l'utilisateur ne l'a pas — à utiliser dans
 * les server actions ; pour gater une page, préférer `redirect('/')` côté
 * appelant après lecture via `aPermission`.
 */
export async function requirePermission(code: string): Promise<UtilisateurCourant> {
  const utilisateur = await requireAuthWithMfa();
  if (!(await aPermission(utilisateur.roleId, code))) {
    throw new Error(`Accès refusé : permission ${code} requise.`);
  }
  return utilisateur;
}
