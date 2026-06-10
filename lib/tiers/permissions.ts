import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à muter le module Tiers (fournisseurs + sous-traitants).
 * Les autres rôles authentifiés y ont accès en lecture seule.
 */
export const ROLES_TIERS_WRITE: readonly Role[] = [
  'admin',
  'conducteur_travaux',
  'acheteur',
];

export function peutEcrireTiers(role: Role): boolean {
  return ROLES_TIERS_WRITE.includes(role);
}
