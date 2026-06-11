import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

export const auditAction = pgEnum('audit_action', ['insert', 'update', 'delete']);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id').references(() => entreprises.id, {
      onDelete: 'restrict',
    }),
    tableName: text('table_name').notNull(),
    rowId: text('row_id').notNull(),
    action: auditAction('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    utilisateurId: text('utilisateur_id').references(() => utilisateurs.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_audit_log_table_row').on(t.tableName, t.rowId, t.createdAt.desc()),
    index('idx_audit_log_entreprise').on(t.entrepriseId),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NouvelAuditLog = typeof auditLog.$inferInsert;

/**
 * Journal d'authentification (audit sécurité B5) — append-only et global
 * (les événements auth précèdent le choix d'entreprise ; un échec de login n'a
 * pas de tenant). Immuabilité (trigger anti UPDATE/DELETE) + verrouillage
 * d'accès (RLS FORCE sans policy → seul `app_admin`/BYPASSRLS via `getDbAdmin`)
 * posés en SQL par la migration 0069 — Drizzle ne modélise que la forme de la
 * table.
 *
 * `email` = adresse *tentée* (peut ne correspondre à aucun compte, ex. login
 * échoué) ; `utilisateurId` rempli quand l'utilisateur est résolu (succès).
 */
export const authAuditLog = pgTable(
  'auth_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // login_success | login_failure | mfa_failure | logout | password_reset
    event: text('event').notNull(),
    email: text('email'),
    utilisateurId: text('utilisateur_id').references(() => utilisateurs.id, {
      onDelete: 'set null',
    }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    success: boolean('success').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_auth_audit_log_created').on(t.createdAt.desc()),
    index('idx_auth_audit_log_event').on(t.event, t.createdAt.desc()),
    index('idx_auth_audit_log_email').on(t.email, t.createdAt.desc()),
  ],
);

export type AuthAuditLog = typeof authAuditLog.$inferSelect;
export type NouvelAuthAuditLog = typeof authAuditLog.$inferInsert;
