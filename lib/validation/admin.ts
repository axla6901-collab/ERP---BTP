import { z } from 'zod';

/**
 * Schemas Zod pour la section Administration (L2).
 * Concerne les CRUD rôles + édition de la matrice rôle × permission.
 */

const codeRole = z
  .string()
  .trim()
  .min(2, 'Code trop court (min 2 caractères).')
  .max(48, 'Code trop long (max 48 caractères).')
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'Code invalide : minuscules, chiffres et underscores uniquement. Doit commencer par une lettre.',
  );

const libelleRole = z
  .string()
  .trim()
  .min(2, 'Libellé trop court (min 2 caractères).')
  .max(80, 'Libellé trop long (max 80 caractères).');

const descriptionRole = z
  .string()
  .trim()
  .max(500, 'Description trop longue (max 500 caractères).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

export const roleCreateSchema = z.object({
  code: codeRole,
  libelle: libelleRole,
  description: descriptionRole,
  actif: z.boolean().default(true),
});
export type RoleCreateInput = z.infer<typeof roleCreateSchema>;

export const roleUpdateSchema = z.object({
  libelle: libelleRole,
  description: descriptionRole,
  actif: z.boolean(),
});
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;

/**
 * Changements à appliquer à la matrice rôle × permission.
 * Chaque entrée représente une cellule cochée/décochée. `granted=true` ⇒ insérer
 * une ligne dans `role_permissions`, `granted=false` ⇒ supprimer la ligne.
 */
export const matriceChangeSchema = z.object({
  roleId: z.uuid('Identifiant de rôle invalide.'),
  permissionId: z.uuid('Identifiant de permission invalide.'),
  granted: z.boolean(),
});
export type MatriceChange = z.infer<typeof matriceChangeSchema>;

export const matriceBatchSchema = z
  .array(matriceChangeSchema)
  .max(2000, 'Trop de changements en un lot (max 2000).');
export type MatriceBatch = z.infer<typeof matriceBatchSchema>;

// ─────────────────────────────────────────────────────────────
// Utilisateurs (L3)
// ─────────────────────────────────────────────────────────────

export const utilisateurAssignRoleSchema = z.object({
  utilisateurId: z.string().min(1, 'Identifiant utilisateur requis.'),
  roleId: z.uuid('Identifiant de rôle invalide.'),
});
export type UtilisateurAssignRoleInput = z.infer<typeof utilisateurAssignRoleSchema>;

export const utilisateurEditSchema = z.object({
  roleId: z.uuid('Identifiant de rôle invalide.'),
  actif: z.boolean(),
});
export type UtilisateurEditInput = z.infer<typeof utilisateurEditSchema>;
