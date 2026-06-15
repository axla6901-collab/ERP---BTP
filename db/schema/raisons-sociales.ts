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
 * Référentiel central des raisons sociales (noms légaux des entités externes).
 *
 * SOURCE UNIQUE référencée par `clients` (professionnels), `fournisseurs`,
 * `sous_traitants` et `societes` (groupe) via une FK `raison_sociale_id`.
 * Plus aucune raison sociale n'est stockée en texte libre sur ces tables.
 *
 * Tenant-scopé (entreprise_id + RLS `p_tenant`, cf. migration 0072).
 * Anti-doublon : unicité du nom par entreprise, insensible à la casse
 * (index `uq_raisons_sociales_nom_active` sur `lower(raison_sociale)` côté SQL —
 * l'index Drizzle ci-dessous est volontairement simple, la migration fait foi).
 */
export const raisonsSociales = pgTable(
  'raisons_sociales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    raisonSociale: text('raison_sociale').notNull(),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Miroir de l'index SQL `uq_raisons_sociales_nom_active` (case-insensitive
    // via lower() dans la migration). Ici en version simple pour le typage.
    uniqueIndex('uq_raisons_sociales_nom_active')
      .on(t.entrepriseId, t.raisonSociale)
      .where(sql`deleted_at IS NULL`),
    index('idx_raisons_sociales_entreprise').on(t.entrepriseId),
    index('idx_raisons_sociales_actif')
      .on(t.actif)
      .where(sql`deleted_at IS NULL`),
    check('chk_raisons_sociales_len', sql`char_length(raison_sociale) BETWEEN 2 AND 200`),
  ],
);

export type RaisonSociale = typeof raisonsSociales.$inferSelect;
export type NouvelleRaisonSociale = typeof raisonsSociales.$inferInsert;
