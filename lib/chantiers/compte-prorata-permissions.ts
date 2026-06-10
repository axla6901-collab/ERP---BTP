import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à muter le module Compte prorata (participants, dépenses).
 * Aligné par défaut sur `ROLES_CHANTIER_WRITE`, mais conservé séparément pour
 * que la matrice DB `COMPTE_PRORATA_WRITE` (migration 0063) puisse diverger
 * sans toucher au module Chantiers.
 *
 * Lecture ouverte à tous les rôles tenant — gardée uniquement par
 * `requireTenantContextWithMfa()` côté server actions.
 */
export const ROLES_COMPTE_PRORATA_WRITE: readonly Role[] = [
  'admin',
  'conducteur_travaux',
  'chef_chantier',
];

export function peutEcrireCompteProrata(role: Role): boolean {
  return ROLES_COMPTE_PRORATA_WRITE.includes(role);
}

/**
 * Rôles autorisés à **arrêter / clôturer** le compte (droit sensible : le
 * verrouillage fige un snapshot juridiquement opposable). Plus restrictif que
 * l'écriture courante.
 */
export const ROLES_COMPTE_PRORATA_ARRETE: readonly Role[] = ['admin', 'conducteur_travaux'];

export function peutArreterCompteProrata(role: Role): boolean {
  return ROLES_COMPTE_PRORATA_ARRETE.includes(role);
}

// ─────────────────────────────────────────────────────────────
// Codes de permission L2 (matrice DB — migration 0063)
// ─────────────────────────────────────────────────────────────

export const PERM_COMPTE_PRORATA_READ = 'COMPTE_PRORATA_READ';
export const PERM_COMPTE_PRORATA_WRITE = 'COMPTE_PRORATA_WRITE';
export const PERM_COMPTE_PRORATA_ARRETE = 'COMPTE_PRORATA_ARRETE';
