import type { Role } from '@/lib/auth/rbac';

/**
 * Droits du module Flotte automobile (option commerciale).
 *
 * Lecture (`FLOTTE_READ`) ouverte à tous les rôles tenant — gardée uniquement
 * par `requireTenantContextWithMfa()` côté server actions. L'écriture du parc
 * (véhicules, échéances, entretiens, sinistres, documents) est réservée à
 * `admin` + `acheteur`. La gestion des affectations terrain est plus large
 * (`FLOTTE_AFFECTATION_WRITE`), vérifiée via `aPermission(roleId, code)`.
 *
 * La matrice DB correspondante est seedée par la migration 0077.
 */

export const PERM_FLOTTE_READ = 'FLOTTE_READ';
export const PERM_FLOTTE_WRITE = 'FLOTTE_WRITE';
export const PERM_FLOTTE_AFFECTATION_WRITE = 'FLOTTE_AFFECTATION_WRITE';

/** Rôles autorisés à gérer le parc (création/édition véhicules, échéances, docs…). */
export const ROLES_FLOTTE_WRITE: readonly Role[] = ['admin', 'acheteur'];

/** Rôles autorisés à gérer les affectations véhicule ↔ conducteur/chantier (terrain). */
export const ROLES_FLOTTE_AFFECTATION_WRITE: readonly Role[] = [
  'admin',
  'acheteur',
  'conducteur_travaux',
  'chef_chantier',
];

export function peutEcrireFlotte(role: Role): boolean {
  return ROLES_FLOTTE_WRITE.includes(role);
}

export function peutAffecterFlotte(role: Role): boolean {
  return ROLES_FLOTTE_AFFECTATION_WRITE.includes(role);
}
