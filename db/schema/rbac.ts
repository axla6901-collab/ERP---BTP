import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Rôles applicatifs. Les rôles `systeme = true` sont seedés par la migration
 * 0021 et ne peuvent pas être supprimés (garde-fou applicatif) — l'application
 * en dépend. Leurs permissions restent éditables via la matrice.
 */
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  libelle: text('libelle').notNull(),
  description: text('description'),
  systeme: boolean('systeme').notNull().default(false),
  actif: boolean('actif').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Permissions atomiques. Le code suit la convention `MODULE_SOUSMODULE_ACTION`
 * (ex : `CATALOGUE_ARTICLES_WRITE`, `COMMERCIAL_DEVIS_SUBMIT`).
 * Les couples `(module, sous_module)` permettent le groupement en arbre dans
 * l'UI de matrice (page /administration/roles).
 */
export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  libelle: text('libelle').notNull(),
  description: text('description'),
  module: text('module').notNull(),
  sousModule: text('sous_module'),
  ordre: integer('ordre').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Matrice rôle × permission. Cocher une case insère une ligne, décocher la
 * supprime. `granted_by` trace qui a accordé la permission (audit).
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    grantedBy: text('granted_by'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
  }),
);

export type RoleRow = typeof roles.$inferSelect;
export type NouveauRoleRow = typeof roles.$inferInsert;
export type PermissionRow = typeof permissions.$inferSelect;
export type RolePermissionRow = typeof rolePermissions.$inferSelect;
