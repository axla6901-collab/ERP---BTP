import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à muter le module Planning (Gantt).
 * Aligné par défaut sur `ROLES_CHANTIER_WRITE`, mais conservé séparément pour
 * que la matrice DB `PLANNING_WRITE` (migration 0054) puisse diverger sans
 * toucher au module Chantiers.
 *
 * Lecture ouverte à tous les rôles tenant — gardée uniquement par
 * `requireTenantContextWithMfa()` côté server actions.
 */
export const ROLES_PLANNING_WRITE: readonly Role[] = [
  'admin',
  'conducteur_travaux',
  'chef_chantier',
];

export function peutEcrirePlanning(role: Role): boolean {
  return ROLES_PLANNING_WRITE.includes(role);
}

/**
 * Permission atomique (RBAC L2, matrice DB — migration 0055) gardant l'accès à
 * la « Vue d'ensemble » multi-chantier. Vérifiée via `aPermission(roleId, code)`.
 * Sans ce droit, l'utilisateur ne voit que la vue « Liste » du planning.
 */
export const PERM_PLANNING_VUE_ENSEMBLE = 'PLANNING_VUE_ENSEMBLE';
