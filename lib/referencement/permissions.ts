import type { Role } from '@/lib/auth/rbac';

/**
 * Permissions (niveau L1 : listes de rôles en dur) du module Référencement &
 * Agrément des tiers. Reflètent la matrice RBAC seedée par la migration 0033 :
 *   - assistant_travaux (AT) : périmètre opérationnel documents + agrément.
 *   - acheteur : documents + agrément.
 *   - conducteur_travaux : référencement (gère ses tiers) + lecture.
 *   - admin : tout, dont l'administration du référentiel.
 */

/** Référencer / éditer un tier dans le registre. */
export const ROLES_REGISTRE_TIERS_WRITE: readonly Role[] = [
  'admin',
  'conducteur_travaux',
  'acheteur',
  'assistant_travaux',
];

/** Ajouter / valider / refuser un document administratif d'un tier. */
export const ROLES_TIERS_DOCUMENTS_WRITE: readonly Role[] = [
  'admin',
  'assistant_travaux',
  'acheteur',
];

/** Statuer sur l'agrément (agréer / refuser / suspendre / réactiver). */
export const ROLES_TIERS_AGREMENT_STATUER: readonly Role[] = [
  'admin',
  'assistant_travaux',
  'acheteur',
];

/** Administrer le référentiel Tiers (corps d'état, natures de document, correspondance, sociétés, règles, matrice). */
export const ROLES_REFERENTIEL_TIERS_WRITE: readonly Role[] = ['admin'];

export function peutEcrireRegistreTiers(role: Role): boolean {
  return ROLES_REGISTRE_TIERS_WRITE.includes(role);
}

export function peutEcrireDocumentsTiers(role: Role): boolean {
  return ROLES_TIERS_DOCUMENTS_WRITE.includes(role);
}

export function peutStatuerAgrement(role: Role): boolean {
  return ROLES_TIERS_AGREMENT_STATUER.includes(role);
}

export function peutAdministrerReferentielTiers(role: Role): boolean {
  return ROLES_REFERENTIEL_TIERS_WRITE.includes(role);
}
