import { ROLES, type Role } from '@/lib/auth/rbac';

/**
 * Droits du module « Test SIRH ». Miroir de la matrice DB seedée par la
 * migration 0080 (`SIRH_READ`, `SIRH_WRITE`, `SIRH_VALIDATION`, `SIRH_PAIE`,
 * `SIRH_LIBRE_SERVICE`), éditable dans /administration/roles.
 *
 * Les server actions et les pages se gardent par ces listes de rôles
 * (`requireTenantContextWithMfa(ROLES_…)`, même patron que Flotte/Planning).
 *
 * - LECTURE    : écrans de gestion (organisation, collaborateurs, absences…).
 * - GESTION    : création / modification des données RH et des référentiels.
 * - VALIDATION : décision sur les demandes (absences, heures sup, notes de frais).
 * - PAIE       : rémunérations (salaires des contrats, variables de paie, export).
 * - LIBRE-SERVICE (tous les rôles) : « Mon espace » — uniquement pour SA fiche
 *   employé (`employes.utilisateur_id` = utilisateur courant).
 */

export const PERM_SIRH_READ = 'SIRH_READ';
export const PERM_SIRH_WRITE = 'SIRH_WRITE';
export const PERM_SIRH_VALIDATION = 'SIRH_VALIDATION';
export const PERM_SIRH_PAIE = 'SIRH_PAIE';
export const PERM_SIRH_LIBRE_SERVICE = 'SIRH_LIBRE_SERVICE';

/** Consultation des écrans de gestion du SIRH. */
export const ROLES_SIRH_LECTURE: readonly Role[] = [
  'admin',
  'rh',
  'comptable',
  'conducteur_travaux',
  'chef_chantier',
  'assistant_travaux',
];

/** Gestion des données RH (organisation, contrats, compteurs, recrutement, formation…). */
export const ROLES_SIRH_GESTION: readonly Role[] = ['admin', 'rh'];

/** Décision sur les demandes (absences, heures supplémentaires, notes de frais). */
export const ROLES_SIRH_VALIDATION: readonly Role[] = [
  'admin',
  'rh',
  'conducteur_travaux',
  'chef_chantier',
];

/** Accès aux rémunérations et à la préparation de paie. */
export const ROLES_SIRH_PAIE: readonly Role[] = ['admin', 'rh', 'comptable'];

/** Espace salarié : tous les rôles tenant (restreint à sa propre fiche employé). */
export const ROLES_SIRH_LIBRE_SERVICE: readonly Role[] = ROLES;

export function peutLireSirh(role: Role): boolean {
  return ROLES_SIRH_LECTURE.includes(role);
}

export function peutGererSirh(role: Role): boolean {
  return ROLES_SIRH_GESTION.includes(role);
}

export function peutValiderSirh(role: Role): boolean {
  return ROLES_SIRH_VALIDATION.includes(role);
}

export function peutVoirPaieSirh(role: Role): boolean {
  return ROLES_SIRH_PAIE.includes(role);
}
