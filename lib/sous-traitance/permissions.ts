import type { Role } from '@/lib/auth/rbac';

/**
 * Permissions du module Sous-traitance (M8).
 *
 * Modèle role-based, cohérent avec `lib/tiers/permissions.ts` et
 * `lib/facturation` (les autres rôles authentifiés ont la lecture seule) :
 *   - Contrats ST : conduite de travaux + achats + admin.
 *   - Factures ST (volet financier) : comptable + admin, plus conduite de
 *     travaux (qui suit l'avancement et déclenche la facturation ST).
 */

export const ROLES_CONTRAT_ST_WRITE: readonly Role[] = ['admin', 'conducteur_travaux', 'acheteur'];

export const ROLES_FACTURE_ST_WRITE: readonly Role[] = ['admin', 'comptable', 'conducteur_travaux'];

export function peutEcrireContratSt(role: Role): boolean {
  return ROLES_CONTRAT_ST_WRITE.includes(role);
}

export function peutEcrireFactureSt(role: Role): boolean {
  return ROLES_FACTURE_ST_WRITE.includes(role);
}
