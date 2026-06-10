import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
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

import { fournisseurs } from './catalogue';
import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

/**
 * Module Tiers : annuaire des partenaires externes (fournisseurs, sous-traitants).
 *
 * `fournisseurs` reste défini dans `./catalogue` car de nombreuses FK du module
 * Catalogue pointent dessus (`articles.fournisseur_prefere_id`,
 * `prix_articles.fournisseur_id`, grilles tarifaires). À terme on pourra
 * déplacer la table ici si on consolide tout le DDL Tiers en un seul fichier.
 *
 * `sous_traitants` est natif au module Tiers — pas de FK depuis Catalogue.
 * Conforme aux exigences légales BTP (loi 75-1334) : SIRET, TVA intracom,
 * assurance décennale, agrément DC4, attestation URSSAF/vigilance,
 * qualifications (Qualibat, RGE, etc.).
 */

/**
 * Statut d'agrément du sous-traitant (cycle de vie référencement BTP).
 * Libellés FR dans `lib/validation/tiers.ts` (STATUT_SOUS_TRAITANT_LABELS) —
 * valeurs maintenues en miroir ici (Drizzle exige un littéral).
 * Distinct du booléen `actif` (archivage), comme dans le registre `tiers`.
 */
export const statutSousTraitant = pgEnum('statut_sous_traitant', [
  'a_qualifier',
  'en_cours_agrement',
  'agree',
  'suspendu',
  'refuse',
]);

export const sousTraitants = pgTable(
  'sous_traitants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    nom: text('nom').notNull(),
    // Cascade de sous-traitance (loi 75-1334) : le « parent » est le donneur
    // d'ordre interne. Profondeur ≤ 3 et absence de cycle garanties par le
    // trigger trg_st_anti_cycle (migration 0061). ON DELETE RESTRICT : on ne
    // supprime pas un ST encore référencé comme parent.
    parentStId: uuid('parent_st_id').references((): AnyPgColumn => sousTraitants.id, {
      onDelete: 'restrict',
    }),
    /**
     * Lien optionnel vers le registre `tiers` (module Référencement, migration
     * 0028). FK `ON DELETE SET NULL` définie côté SQL ; non modélisée en
     * `.references()` ici pour éviter un cycle d'import avec `tiers-registre.ts`.
     * Sert au blocage de conformité documentaire des contrats ST (M8.2).
     */
    tierId: uuid('tier_id'),
    siret: text('siret'),
    nTvaIntra: text('n_tva_intra'),
    email: text('email'),
    telephone: text('telephone'),
    adresseLigne1: text('adresse_ligne1'),
    adresseLigne2: text('adresse_ligne2'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    pays: text('pays').notNull().default('France'),
    assuranceDecennaleNum: text('assurance_decennale_num'),
    assuranceDecennaleDateFin: date('assurance_decennale_date_fin'),
    qualifications: jsonb('qualifications').$type<string[]>().notNull().default([]),
    agrementDc4: boolean('agrement_dc4').notNull().default(false),
    // Taux de retenue de garantie par défaut (0–10 %). Copié (figé) sur le
    // contrat ST à sa création, puis sur la facture ST. Stocké en texte par
    // Drizzle (numeric), parsé côté app comme pour les montants de facturation.
    tauxRetenueGarantie: numeric('taux_retenue_garantie', { precision: 5, scale: 2 })
      .notNull()
      .default('0'),
    dateAttestationUrssaf: date('date_attestation_urssaf'),
    statut: statutSousTraitant('statut').notNull().default('a_qualifier'),
    actif: boolean('actif').notNull().default(true),
    dateSortie: date('date_sortie'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_sous_traitants_actif').on(t.actif),
    index('idx_sous_traitants_ville').on(t.ville),
    index('idx_sous_traitants_statut').on(t.statut),
    index('idx_sous_traitants_parent').on(t.parentStId),
    check('chk_sous_traitants_cp', sql`code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'`),
    check(
      'chk_sous_traitants_taux_retenue',
      sql`taux_retenue_garantie >= 0 AND taux_retenue_garantie <= 10`,
    ),
    check(
      'chk_sous_traitants_parent_self',
      sql`parent_st_id IS NULL OR parent_st_id <> id`,
    ),
  ],
);

export type SousTraitant = typeof sousTraitants.$inferSelect;
export type NouveauSousTraitant = typeof sousTraitants.$inferInsert;

// Contacts multiples par sous-traitant. Mêmes règles que pour les fournisseurs :
// soft-delete via `deleted_at`, statut `actif` + un seul `principal` actif.
export const sousTraitantContacts = pgTable(
  'sous_traitant_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    sousTraitantId: uuid('sous_traitant_id')
      .notNull()
      .references(() => sousTraitants.id, { onDelete: 'cascade' }),
    nom: text('nom').notNull(),
    prenom: text('prenom'),
    fonction: text('fonction'),
    email: text('email'),
    telephoneMobile: text('telephone_mobile'),
    telephoneFixe: text('telephone_fixe'),
    notes: text('notes'),
    principal: boolean('principal').notNull().default(false),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_sous_traitant_contacts_sous_traitant').on(t.sousTraitantId),
    index('idx_sous_traitant_contacts_actif').on(t.sousTraitantId, t.actif),
    uniqueIndex('uq_sous_traitant_contacts_principal')
      .on(t.sousTraitantId)
      .where(sql`principal = true AND deleted_at IS NULL`),
  ],
);

export type SousTraitantContact = typeof sousTraitantContacts.$inferSelect;
export type NouveauSousTraitantContact = typeof sousTraitantContacts.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Documents administratifs des tiers (migration 0059)
// ─────────────────────────────────────────────────────────────

/**
 * Documents importés rattachés à un tiers (K-BIS, attestation URSSAF de
 * vigilance, assurance décennale, RC pro, attestation fiscale/sociale, RIB,
 * qualifications…). Le fichier vit en MinIO (`minio_key`, cf. lib/storage/s3.ts) ;
 * la table ne porte que les métadonnées + la date de validité.
 *
 * Propriétaire polymorphe « exactement un » : soit `sousTraitantId`, soit
 * `fournisseurId` (contrainte `chk_documents_tiers_proprietaire_unique`). On ne
 * passe PAS par le registre `tiers` (module agrément non câblé). Libellés des
 * types dans `lib/validation/tiers.ts`.
 */
export const typeDocumentTier = pgEnum('type_document_tier', [
  'kbis',
  'attestation_urssaf',
  'assurance_decennale',
  'assurance_rc_pro',
  'attestation_fiscale',
  'attestation_regularite_sociale',
  'liste_salaries_etrangers',
  'qualification',
  'contrat_sous_traitance',
  'rib',
  'autre',
]);

export const documentsTiers = pgTable(
  'documents_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    sousTraitantId: uuid('sous_traitant_id').references(() => sousTraitants.id, {
      onDelete: 'cascade',
    }),
    fournisseurId: uuid('fournisseur_id').references(() => fournisseurs.id, {
      onDelete: 'cascade',
    }),
    type: typeDocumentTier('type').notNull().default('autre'),
    libelle: text('libelle').notNull(),
    minioKey: text('minio_key').notNull(),
    mimeType: text('mime_type').notNull(),
    tailleBytes: bigint('taille_bytes', { mode: 'number' }),
    dateValidite: date('date_validite'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_documents_tiers_sous_traitant').on(t.sousTraitantId),
    index('idx_documents_tiers_fournisseur').on(t.fournisseurId),
    index('idx_documents_tiers_validite').on(t.dateValidite),
    check(
      'chk_documents_tiers_proprietaire_unique',
      sql`(sous_traitant_id IS NOT NULL)::int + (fournisseur_id IS NOT NULL)::int = 1`,
    ),
    check(
      'chk_documents_tiers_taille',
      sql`taille_bytes IS NULL OR taille_bytes > 0`,
    ),
  ],
);

export type DocumentTier = typeof documentsTiers.$inferSelect;
export type NouveauDocumentTier = typeof documentsTiers.$inferInsert;
