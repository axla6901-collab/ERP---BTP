import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';
import { chantiers } from './chantiers';
import { sousTraitants } from './tiers';

// ─────────────────────────────────────────────────────────────
// Module Compte prorata (BTP, norme NF P03-001) — cf. migration 0062
// ─────────────────────────────────────────────────────────────
//   Mutualisation des dépenses communes d'un chantier (nettoyage,
//   gardiennage, énergie, bennes, base-vie…) réparties entre les
//   intervenants au prorata de leur montant de marché HT, avec suivi
//   de qui a avancé chaque dépense → solde par participant + arrêté
//   de compte figé.

/** Cycle de vie d'un compte prorata. `arrete` = lecture seule (snapshot figé). */
export const statutCompteProrata = pgEnum('statut_compte_prorata', [
  'ouvert',
  'cloture',
  'arrete',
]);

// ─────────────────────────────────────────────────────────────
// 1. Compte prorata (paramètres, 1 par chantier)
// ─────────────────────────────────────────────────────────────

export const compteProrata = pgTable(
  'compte_prorata',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    chantierId: uuid('chantier_id')
      .notNull()
      .references(() => chantiers.id, { onDelete: 'restrict' }),
    /** Clé de répartition. Extensible ; seule 'montant_marche_ht' est gérée pour l'instant. */
    baseRepartition: text('base_repartition').notNull().default('montant_marche_ht'),
    /** Frais de gestion du compte (% des dépenses), mutualisés dans la base répartie. */
    fraisGestionPct: numeric('frais_gestion_pct', { precision: 5, scale: 2 }),
    statut: statutCompteProrata('statut').notNull().default('ouvert'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Un seul compte prorata actif par chantier.
    uniqueIndex('uq_compte_prorata_chantier_actif')
      .on(t.chantierId)
      .where(sql`deleted_at IS NULL`),
    index('idx_compte_prorata_entreprise').on(t.entrepriseId),
    check(
      'chk_compte_prorata_frais_pct',
      sql`frais_gestion_pct IS NULL OR (frais_gestion_pct >= 0 AND frais_gestion_pct <= 100)`,
    ),
  ],
);

export type CompteProrata = typeof compteProrata.$inferSelect;
export type NouveauCompteProrata = typeof compteProrata.$inferInsert;

// ─────────────────────────────────────────────────────────────
// 2. Participants / lots (porte la clé de répartition)
// ─────────────────────────────────────────────────────────────

export const compteProrataParticipants = pgTable(
  'compte_prorata_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    compteProrataId: uuid('compte_prorata_id')
      .notNull()
      .references(() => compteProrata.id, { onDelete: 'cascade' }),
    /** Sous-traitant rattaché (NULL = lot « maison » ou co-traitant libre). */
    sousTraitantId: uuid('sous_traitant_id').references(() => sousTraitants.id, {
      onDelete: 'restrict',
    }),
    /** Libellé affiché (toujours renseigné, fait foi même si sous_traitant_id est NULL). */
    libelle: text('libelle').notNull(),
    montantMarcheHt: numeric('montant_marche_ht', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    /** Surcharge manuelle de quote-part (prioritaire sur le prorata du marché). */
    quotePartPctManuel: numeric('quote_part_pct_manuel', { precision: 5, scale: 2 }),
    /** Le pilote/gestionnaire du compte prorata (un seul actif par compte). */
    estGestionnaire: boolean('est_gestionnaire').notNull().default(false),
    ordre: integer('ordre').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_cpp_compte').on(t.compteProrataId, t.ordre).where(sql`deleted_at IS NULL`),
    index('idx_cpp_sous_traitant').on(t.sousTraitantId),
    index('idx_cpp_entreprise').on(t.entrepriseId),
    // Pas deux fois le même sous-traitant dans un même compte.
    uniqueIndex('uq_cpp_compte_st_actif')
      .on(t.compteProrataId, t.sousTraitantId)
      .where(sql`sous_traitant_id IS NOT NULL AND deleted_at IS NULL`),
    // Un seul gestionnaire/pilote actif par compte.
    uniqueIndex('uq_cpp_gestionnaire_actif')
      .on(t.compteProrataId)
      .where(sql`est_gestionnaire = true AND deleted_at IS NULL`),
    check('chk_cpp_montant_marche_pos', sql`montant_marche_ht >= 0`),
    check(
      'chk_cpp_quote_part_pct',
      sql`quote_part_pct_manuel IS NULL OR (quote_part_pct_manuel >= 0 AND quote_part_pct_manuel <= 100)`,
    ),
  ],
);

export type CompteProrataParticipant = typeof compteProrataParticipants.$inferSelect;
export type NouveauCompteProrataParticipant = typeof compteProrataParticipants.$inferInsert;

// ─────────────────────────────────────────────────────────────
// 3. Dépenses communes (chaque dépense = une avance de son payeur)
// ─────────────────────────────────────────────────────────────

export const compteProrataDepenses = pgTable(
  'compte_prorata_depenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    compteProrataId: uuid('compte_prorata_id')
      .notNull()
      .references(() => compteProrata.id, { onDelete: 'cascade' }),
    /** Participant qui a engagé/avancé la dépense (sert au calcul des soldes). */
    avanceParParticipantId: uuid('avance_par_participant_id')
      .notNull()
      .references(() => compteProrataParticipants.id, { onDelete: 'restrict' }),
    dateDepense: date('date_depense').notNull(),
    libelle: text('libelle').notNull(),
    /** Nature : nettoyage, gardiennage, énergie, benne, base-vie… (free-text). */
    categorie: text('categorie'),
    montantHt: numeric('montant_ht', { precision: 14, scale: 2 }).notNull(),
    /** Clé de la pièce justificative (stockage objet), optionnel. */
    pieceJustificativeKey: text('piece_justificative_key'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_cpd_compte').on(t.compteProrataId, t.dateDepense).where(sql`deleted_at IS NULL`),
    index('idx_cpd_avance_par').on(t.avanceParParticipantId),
    index('idx_cpd_entreprise').on(t.entrepriseId),
    check('chk_cpd_montant_pos', sql`montant_ht > 0`),
  ],
);

export type CompteProrataDepense = typeof compteProrataDepenses.$inferSelect;
export type NouvelleCompteProrataDepense = typeof compteProrataDepenses.$inferInsert;

// ─────────────────────────────────────────────────────────────
// 4. Arrêtés de compte (snapshot immuable de la clôture)
// ─────────────────────────────────────────────────────────────

export const compteProrataArretes = pgTable(
  'compte_prorata_arretes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    compteProrataId: uuid('compte_prorata_id')
      .notNull()
      .references(() => compteProrata.id, { onDelete: 'cascade' }),
    /** Numéro séquentiel par compte (1, 2… en cas de ré-arrêté). */
    numero: integer('numero').notNull(),
    dateArrete: date('date_arrete').notNull(),
    totalDepensesHt: numeric('total_depenses_ht', { precision: 14, scale: 2 }).notNull(),
    totalMarcheHt: numeric('total_marche_ht', { precision: 14, scale: 2 }).notNull(),
    fraisGestionMontant: numeric('frais_gestion_montant', { precision: 14, scale: 2 })
      .notNull()
      .default('0'),
    /** Bilan figé (`BilanCompteProrata` sérialisé : quote-parts, avances, soldes). */
    snapshot: jsonb('snapshot').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_cpa_compte_numero').on(t.compteProrataId, t.numero),
    index('idx_cpa_compte').on(t.compteProrataId),
    index('idx_cpa_entreprise').on(t.entrepriseId),
  ],
);

export type CompteProrataArrete = typeof compteProrataArretes.$inferSelect;
export type NouvelArreteCompteProrata = typeof compteProrataArretes.$inferInsert;
