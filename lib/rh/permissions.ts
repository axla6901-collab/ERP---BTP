import type { Role } from '@/lib/auth/rbac';

/**
 * Rôles autorisés à muter les employés (M5.1).
 * Plus restrictif que pointages : touche aux données personnelles.
 */
export const ROLES_RH_WRITE: readonly Role[] = ['admin', 'rh', 'comptable'];

/**
 * Rôles autorisés à saisir / modifier des pointages (M5.2).
 * Ouvert aux chefs de chantier et conducteurs travaux qui font la saisie
 * terrain (cf. réalité PME BTP).
 */
export const ROLES_POINTAGE_WRITE: readonly Role[] = [
  'admin',
  'rh',
  'conducteur_travaux',
  'chef_chantier',
];

export function peutEcrireEmploye(role: Role): boolean {
  return ROLES_RH_WRITE.includes(role);
}

export function peutEcrirePointage(role: Role): boolean {
  return ROLES_POINTAGE_WRITE.includes(role);
}
