import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à accéder à la section Administration tenant (utilisateurs,
 * rôles, permissions, ma société). Pour la L1 du RBAC granulaire, seuls les
 * `admin` ont accès — la L2 introduira la vérification par permissions
 * atomiques (`ADMIN_UTILISATEURS_READ`, `ADMIN_ROLES_WRITE`, etc.).
 *
 * Le MCD reste exclusivement super-admin (`/admin/mcd`) et n'apparaît jamais
 * dans cette section tenant.
 */
export const ROLES_ADMINISTRATION: readonly Role[] = ['admin'];

export function peutAdministrer(role: Role): boolean {
  return ROLES_ADMINISTRATION.includes(role);
}
