import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à muter le module Chantiers.
 * Lecture ouverte à tous les rôles authentifiés.
 *
 * Cf. ADR-002 (rôles) + ADR-011 (module Chantiers).
 */
export const ROLES_CHANTIER_WRITE: readonly Role[] = [
  'admin',
  'conducteur_travaux',
  'chef_chantier',
];

export function peutEcrireChantier(role: Role): boolean {
  return ROLES_CHANTIER_WRITE.includes(role);
}
