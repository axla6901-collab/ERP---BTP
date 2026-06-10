import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

/**
 * Sociétés du groupe (porte la Table 2 du docx FEB_Contrôle Artisans).
 * Migrations 0028 (table) + 0030 (règles) + 0058 (entreprise_id + RLS).
 *
 * Une société peut se voir appliquer des règles métier paramétrables
 * (`societes_regles`), p. ex. la suspension de chantier avec envoi de LRAR.
 */

export const societes = pgTable(
  'societes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    raisonSociale: text('raison_sociale').notNull(),
    siret: text('siret'),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_societes_code_active').on(t.code).where(sql`deleted_at IS NULL`),
    index('idx_societes_actif').on(t.actif).where(sql`deleted_at IS NULL`),
    index('idx_societes_entreprise').on(t.entrepriseId),
    check('chk_societes_code_format', sql`code ~ '^[A-Z0-9._-]{2,32}$'`),
    check('chk_societes_raison_len', sql`char_length(raison_sociale) BETWEEN 2 AND 200`),
    check('chk_societes_siret', sql`siret IS NULL OR siret ~ '^[0-9]{14}$'`),
  ],
);

export type Societe = typeof societes.$inferSelect;
export type NouvelleSociete = typeof societes.$inferInsert;

/**
 * Règles applicables par société. Le `code_regle` est un texte (pas un enum)
 * pour pouvoir ajouter une règle par paramétrage sans migration.
 */
export const societesRegles = pgTable(
  'societes_regles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    societeId: uuid('societe_id')
      .notNull()
      .references(() => societes.id, { onDelete: 'cascade' }),
    codeRegle: text('code_regle').notNull(),
    libelle: text('libelle').notNull(),
    applique: boolean('applique').notNull().default(false),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('uq_societes_regles_societe_code').on(t.societeId, t.codeRegle),
    index('idx_societes_regles_societe').on(t.societeId),
    index('idx_societes_regles_entreprise').on(t.entrepriseId),
    check('chk_societes_regles_code_format', sql`code_regle ~ '^[A-Z0-9._-]{2,64}$'`),
  ],
);

export type SocieteRegle = typeof societesRegles.$inferSelect;
export type NouvelleSocieteRegle = typeof societesRegles.$inferInsert;
