import { jsonb, pgEnum, pgTable, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';

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
