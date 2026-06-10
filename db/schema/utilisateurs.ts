import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { roles } from './rbac';

export const utilisateurs = pgTable('utilisateurs', {
  id: text('id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'restrict' }),
  employeId: uuid('employe_id').unique(),
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  actif: boolean('actif').notNull().default(true),
  derniereConnexionAt: timestamp('derniere_connexion_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type Utilisateur = typeof utilisateurs.$inferSelect;
export type NouvelUtilisateur = typeof utilisateurs.$inferInsert;
