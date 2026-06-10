/**
 * Codes des rôles système seedés par la migration 0021_rbac_granulaire.
 * Ces rôles ne peuvent pas être supprimés (garde-fou applicatif) ; leurs
 * permissions restent éditables via la matrice.
 *
 * Le champ `utilisateurs.role_id` est une FK vers `roles.id`. Les codes
 * ci-dessous sont la version stable utilisée par les helpers `peut*` des
 * différents modules — la phase L2 du RBAC introduira la vérification par
 * permissions atomiques (table `role_permissions`).
 */
export const ROLES = [
  'admin',
  'conducteur_travaux',
  'chef_chantier',
  'comptable',
  'acheteur',
  'rh',
  'ouvrier',
  'lecture_seule',
  'assistant_travaux',
] as const;

export type Role = (typeof ROLES)[number];

/** Code de rôle au sens large : un rôle système OU un rôle custom créé via /administration/roles. */
export type RoleCode = string;

export const LIBELLES_ROLE: Record<Role, string> = {
  admin: 'Administrateur',
  conducteur_travaux: 'Conducteur de travaux',
  chef_chantier: 'Chef de chantier',
  comptable: 'Comptable',
  acheteur: 'Acheteur',
  rh: 'RH',
  ouvrier: 'Ouvrier',
  lecture_seule: 'Lecture seule',
  assistant_travaux: 'Assistant·e travaux',
};

// Rôles devant activer la MFA TOTP en M1.2 (cf. MCD §rôles).
export const ROLES_MFA_OBLIGATOIRE: readonly Role[] = ['admin', 'comptable', 'rh'];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
