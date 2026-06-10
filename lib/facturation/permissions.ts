import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à muter le module Facturation.
 * Les autres rôles authentifiés ont un accès en lecture seule.
 *
 * Cf. ADR-002 (rôles) et ROADMAP M6.
 */
export const ROLES_FACTURATION_WRITE: readonly Role[] = ['admin', 'comptable'];

export function peutEcrireFacturation(role: Role): boolean {
  return ROLES_FACTURATION_WRITE.includes(role);
}
