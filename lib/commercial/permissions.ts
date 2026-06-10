import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à muter le module commercial (clients + devis).
 * Lecture ouverte à tous les rôles authentifiés.
 *
 * Cf. ADR-002 (rôles). Le comptable est inclus car il gère le suivi commercial.
 */
export const ROLES_COMMERCIAL_WRITE: readonly Role[] = [
  'admin',
  'conducteur_travaux',
  'comptable',
];

export function peutEcrireCommercial(role: Role): boolean {
  return ROLES_COMMERCIAL_WRITE.includes(role);
}
