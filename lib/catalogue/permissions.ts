import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à muter le catalogue (création / édition / suppression).
 * Les autres rôles authentifiés ont l'accès en lecture seule.
 *
 * Cf. ADR-002 (rôles) et discussion M2.1 (plan).
 */
export const ROLES_CATALOGUE_WRITE: readonly Role[] = [
  'admin',
  'conducteur_travaux',
  'acheteur',
];

export function peutEcrireCatalogue(role: Role): boolean {
  return ROLES_CATALOGUE_WRITE.includes(role);
}
