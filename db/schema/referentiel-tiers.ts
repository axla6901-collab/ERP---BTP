import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

/**
 * Référentiel paramétrable du module Référencement & Agrément des tiers
 * (FEB_Contrôle Artisans §I, §II — Tables 1 à 5).
 * Migrations 0029 (corps d'état), 0030 (matrice types d'engagement), 0031
 * (natures de document + correspondance) + 0058 (entreprise_id + RLS).
 *
 * Enums partagés (définis ici, importés par `tiers-registre.ts` pour éviter les
 * imports circulaires) :
 *   - nature_tiers          : nature du tier (Ch. 1).
 *   - type_engagement       : marché de travaux / bon de commande (Table 1).
 *   - mode_controle_document: comment la validité d'un document est contrôlée.
 */

export const natureTiers = pgEnum('nature_tiers', [
  'artisan',
  'artisan_ae',
  'fournisseur',
  'fournisseur_artisan',
]);

export const typeEngagement = pgEnum('type_engagement', ['marche_travaux', 'bon_commande']);

export const modeControleDocument = pgEnum('mode_controle_document', [
  'duree_jours',
  'date_fin_assurance',
  'case_a_cocher',
  'date_obtention',
]);

// ─────────────────────────────────────────────────────────────
// Corps d'état (référentiel paramétrable des activités du tier)
// ─────────────────────────────────────────────────────────────

export const corpsEtat = pgTable(
  'corps_etat',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    libelle: text('libelle').notNull(),
    ordreAffichage: integer('ordre_affichage').notNull().default(0),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_corps_etat_code_active')
      .on(t.code)
      .where(sql`deleted_at IS NULL`),
    index('idx_corps_etat_actif')
      .on(t.actif, t.ordreAffichage)
      .where(sql`deleted_at IS NULL`),
    index('idx_corps_etat_entreprise').on(t.entrepriseId),
    check('chk_corps_etat_code_format', sql`code ~ '^[A-Z0-9._-]{2,32}$'`),
    check('chk_corps_etat_libelle_len', sql`char_length(libelle) BETWEEN 2 AND 200`),
  ],
);

export type CorpsEtat = typeof corpsEtat.$inferSelect;
export type NouveauCorpsEtat = typeof corpsEtat.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Natures de document administratif (K-bis, URSSAF, assurances…)
// ─────────────────────────────────────────────────────────────

export const naturesDocument = pgTable(
  'natures_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    libelle: text('libelle').notNull(),
    modeControle: modeControleDocument('mode_controle').notNull(),
    /** Délai de validité en jours (ou tolérance après date d'expiration pour les assurances). */
    delaiValiditeJours: integer('delai_validite_jours'),
    /** Délai de relance avant expiration (jours). NULL = pas de relance. */
    delaiRelanceJours: integer('delai_relance_jours'),
    ordreAffichage: integer('ordre_affichage').notNull().default(0),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_natures_document_code_active')
      .on(t.code)
      .where(sql`deleted_at IS NULL`),
    index('idx_natures_document_actif')
      .on(t.actif, t.ordreAffichage)
      .where(sql`deleted_at IS NULL`),
    index('idx_natures_document_entreprise').on(t.entrepriseId),
    check('chk_natures_document_code_format', sql`code ~ '^[A-Z0-9._-]{2,32}$'`),
    check('chk_natures_document_libelle_len', sql`char_length(libelle) BETWEEN 2 AND 200`),
    check(
      'chk_natures_document_delais_positifs',
      sql`(delai_validite_jours IS NULL OR delai_validite_jours >= 0) AND (delai_relance_jours IS NULL OR delai_relance_jours >= 0)`,
    ),
  ],
);

export type NatureDocument = typeof naturesDocument.$inferSelect;
export type NouvelleNatureDocument = typeof naturesDocument.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Correspondance corps d'état × nature de tier × nature de document
// « ce document est requis pour cette combinaison » (Table 3/5).
// ─────────────────────────────────────────────────────────────

export const corpsEtatDocumentsRequis = pgTable(
  'corps_etat_documents_requis',
  {
    corpsEtatId: uuid('corps_etat_id')
      .notNull()
      .references(() => corpsEtat.id, { onDelete: 'cascade' }),
    natureDocumentId: uuid('nature_document_id')
      .notNull()
      .references(() => naturesDocument.id, { onDelete: 'cascade' }),
    natureTiers: natureTiers('nature_tiers').notNull(),
    estBloquant: boolean('est_bloquant').notNull().default(true),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.corpsEtatId, t.natureDocumentId, t.natureTiers] }),
    index('idx_corps_etat_docs_corps').on(t.corpsEtatId, t.natureTiers),
    index('idx_corps_etat_docs_doc').on(t.natureDocumentId),
    index('idx_corps_etat_documents_requis_entreprise').on(t.entrepriseId),
  ],
);

export type CorpsEtatDocumentRequis = typeof corpsEtatDocumentsRequis.$inferSelect;
export type NouveauCorpsEtatDocumentRequis = typeof corpsEtatDocumentsRequis.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Matrice nature_tiers × type_engagement (Table 1, cloisonnement).
// GLOBALE : référentiel sectoriel partagé entre toutes les entreprises
// (pas d'entreprise_id, pas de RLS), seedée par la migration 0030.
// ─────────────────────────────────────────────────────────────

export const natureTiersTypesEngagement = pgTable(
  'nature_tiers_types_engagement',
  {
    natureTiers: natureTiers('nature_tiers').notNull(),
    typeEngagement: typeEngagement('type_engagement').notNull(),
    autorise: boolean('autorise').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.natureTiers, t.typeEngagement] })],
);

export type NatureTiersTypeEngagement = typeof natureTiersTypesEngagement.$inferSelect;
export type NouveauNatureTiersTypeEngagement = typeof natureTiersTypesEngagement.$inferInsert;
