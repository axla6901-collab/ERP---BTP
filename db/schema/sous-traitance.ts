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

import { articles } from './catalogue';
import { chantiers } from './chantiers';
import { entreprises } from './entreprises';
import { typeLigneFacture } from './facturation';
import { sousTraitants } from './tiers';
import { utilisateurs } from './utilisateurs';

/**
 * M8 — Sous-traitance : contrats ST (chantier × sous-traitant) et factures ST
 * (multi-lignes, retenue de garantie obligatoire, paiement direct).
 *
 * Les sous-traitants eux-mêmes vivent dans `./tiers` (table `sous_traitants`,
 * avec cascade `parent_st_id` + `taux_retenue_garantie`, migration 0061).
 * Migrations DDL : 0064 (contrats), 0065 (factures + lignes).
 *
 * Numérotation : generate_numero('contrat_st') → ST-<année>-000XXX,
 * generate_numero('facture_st') → FST-<année>-000XXX (câblé 0043/0057).
 */

// ─────────────────────────────────────────────────────────────
// Contrats de sous-traitance
// ─────────────────────────────────────────────────────────────

export const statutContratSt = pgEnum('statut_contrat_st', [
  'brouillon',
  'actif',
  'suspendu',
  'solde',
  'annule',
]);

export const contratsSt = pgTable(
  'contrats_st',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    sousTraitantId: uuid('sous_traitant_id')
      .notNull()
      .references(() => sousTraitants.id, { onDelete: 'restrict' }),
    chantierId: uuid('chantier_id')
      .notNull()
      .references(() => chantiers.id, { onDelete: 'restrict' }),
    numero: text('numero').notNull(),
    objet: text('objet'),
    montantHt: numeric('montant_ht', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Figé (copié du sous-traitant) à la création du contrat. */
    tauxRetenueGarantie: numeric('taux_retenue_garantie', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    /** = montant_ht × taux/100, figé en app (cf. lib/facturation/calculs). */
    montantRetenue: numeric('montant_retenue', { precision: 14, scale: 2 }),
    dateSignature: date('date_signature'),
    dateDebutPrevue: date('date_debut_prevue'),
    dateFinPrevue: date('date_fin_prevue'),
    statut: statutContratSt('statut').notNull().default('brouillon'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_contrats_st_entreprise_numero')
      .on(t.entrepriseId, t.numero)
      .where(sql`deleted_at IS NULL`),
    index('idx_contrats_st_entreprise').on(t.entrepriseId),
    index('idx_contrats_st_sous_traitant').on(t.sousTraitantId),
    index('idx_contrats_st_chantier').on(t.chantierId),
    index('idx_contrats_st_statut').on(t.statut),
    check('chk_contrats_st_montant', sql`montant_ht >= 0`),
    check(
      'chk_contrats_st_retenue',
      sql`taux_retenue_garantie >= 0 AND taux_retenue_garantie <= 10`,
    ),
    check(
      'chk_contrats_st_dates',
      sql`date_fin_prevue IS NULL OR date_debut_prevue IS NULL OR date_fin_prevue >= date_debut_prevue`,
    ),
  ],
);

export type ContratSt = typeof contratsSt.$inferSelect;
export type NouveauContratSt = typeof contratsSt.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Factures de sous-traitant
// ─────────────────────────────────────────────────────────────

export const statutFactureSt = pgEnum('statut_facture_st', [
  'brouillon',
  'emise',
  'payee',
  'en_retard',
  'annulee',
]);

export const facturesSt = pgTable(
  'factures_st',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    contratStId: uuid('contrat_st_id')
      .notNull()
      .references(() => contratsSt.id, { onDelete: 'restrict' }),
    numero: text('numero').notNull(),
    dateFacture: date('date_facture').notNull().defaultNow(),
    dateEcheance: date('date_echeance'),
    delaiPaiementJours: integer('delai_paiement_jours'),
    statut: statutFactureSt('statut').notNull().default('brouillon'),
    objet: text('objet'),
    notes: text('notes'),
    totalHt: numeric('total_ht', { precision: 14, scale: 2 }).notNull().default('0'),
    totalTva: numeric('total_tva', { precision: 14, scale: 2 }).notNull().default('0'),
    totalTtc: numeric('total_ttc', { precision: 14, scale: 2 }).notNull().default('0'),
    detailsTva: jsonb('details_tva'),
    remiseGlobaleType: text('remise_globale_type'),
    remiseGlobaleValeur: numeric('remise_globale_valeur', { precision: 14, scale: 2 }),
    /** Retenue de garantie OBLIGATOIRE (figée depuis le contrat ST). */
    retenueGarantiePct: numeric('retenue_garantie_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    montantRetenue: numeric('montant_retenue', { precision: 14, scale: 2 }).notNull().default('0'),
    /** = total_ttc − montant_retenue (montant net à payer au sous-traitant). */
    montantNet: numeric('montant_net', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Auto-liquidation TVA BTP (art. 283-2 nonies CGI) — défaut true en sous-traitance. */
    autoLiquidation: boolean('auto_liquidation').notNull().default(true),
    /** Paiement direct du sous-traitant (loi 75-1334 §III). */
    paiementDirect: boolean('paiement_direct').notNull().default(false),
    /** Cumul TTC déjà réglé (suivi des paiements). */
    cumulPayeTtc: numeric('cumul_paye_ttc', { precision: 14, scale: 2 }).notNull().default('0'),
    dateEmission: timestamp('date_emission', { withTimezone: true }),
    datePaiement: date('date_paiement'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_factures_st_entreprise_numero')
      .on(t.entrepriseId, t.numero)
      .where(sql`deleted_at IS NULL`),
    index('idx_factures_st_entreprise').on(t.entrepriseId),
    index('idx_factures_st_contrat').on(t.contratStId),
    index('idx_factures_st_statut').on(t.statut),
    index('idx_factures_st_date').on(t.dateFacture.desc()),
    check('chk_factures_st_retenue', sql`retenue_garantie_pct >= 0 AND retenue_garantie_pct <= 10`),
    check('chk_factures_st_cumul', sql`cumul_paye_ttc >= 0`),
    check('chk_factures_st_dates', sql`date_echeance IS NULL OR date_echeance >= date_facture`),
    check(
      'chk_factures_st_remise_globale',
      sql`remise_globale_type IS NULL OR (remise_globale_type IN ('pourcent','montant') AND remise_globale_valeur IS NOT NULL AND remise_globale_valeur > 0 AND (remise_globale_type <> 'pourcent' OR remise_globale_valeur <= 100))`,
    ),
  ],
);

export type FactureSt = typeof facturesSt.$inferSelect;
export type NouvelleFactureSt = typeof facturesSt.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Lignes de facture ST (calquées sur lignes_facture)
// ─────────────────────────────────────────────────────────────

export const lignesFactureSt = pgTable(
  'lignes_facture_st',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    factureStId: uuid('facture_st_id')
      .notNull()
      .references(() => facturesSt.id, { onDelete: 'cascade' }),
    ordre: integer('ordre').notNull(),
    type: typeLigneFacture('type').notNull(),
    designation: text('designation').notNull(),
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'restrict' }),
    quantite: numeric('quantite', { precision: 14, scale: 4 }),
    unite: text('unite'),
    prixUnitaireHt: numeric('prix_unitaire_ht', { precision: 14, scale: 2 }),
    tauxTva: numeric('taux_tva', { precision: 5, scale: 2 }),
    remisePourcent: numeric('remise_pourcent', { precision: 5, scale: 2 }).default('0'),
    montantHt: numeric('montant_ht', { precision: 14, scale: 2 }),
    montantTva: numeric('montant_tva', { precision: 14, scale: 2 }),
    montantTtc: numeric('montant_ttc', { precision: 14, scale: 2 }),
    notes: text('notes'),
  },
  (t) => [index('idx_lignes_facture_st_facture').on(t.factureStId, t.ordre)],
);

export type LigneFactureSt = typeof lignesFactureSt.$inferSelect;
export type NouvelleLigneFactureSt = typeof lignesFactureSt.$inferInsert;
