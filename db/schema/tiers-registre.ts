import {
  bigint,
  boolean,
  check,
  date,
  index,
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
import { corpsEtat, naturesDocument, natureTiers } from './referentiel-tiers';
import { societes } from './societes';
import { utilisateurs } from './utilisateurs';

/**
 * Registre unifié des tiers + agrément (FEB_Contrôle Artisans §I, §III ;
 * schéma PDF 04/03/2025). Migrations 0028 (registre), 0029 (jointures),
 * 0032 (documents + relances) + 0058 (entreprise_id + RLS).
 *
 * Registre NOUVEAU et DISTINCT des tables historiques `sous_traitants` /
 * `fournisseurs` (catalogue), reliées via leur colonne `tier_id` nullable.
 */

export const statutAgrement = pgEnum('statut_agrement', [
  'a_creer',
  'en_attente_documents',
  'agree',
  'refuse_auto',
  'refuse_manuel',
  'suspendu',
]);

export const statutDocumentTier = pgEnum('statut_document_tier', [
  'en_attente_validation',
  'valide',
  'expire',
  'a_renouveler',
  'refuse',
]);

export const contexteRelanceAgrement = pgEnum('contexte_relance_agrement', [
  'agrement_initial',
  'renouvellement',
  'retour_marche_signe',
]);

export const niveauRelanceAgrement = pgEnum('niveau_relance_agrement', [
  'r1',
  'r2',
  'r3',
  'escalade_manager',
]);

// ─────────────────────────────────────────────────────────────
// Registre des tiers
// ─────────────────────────────────────────────────────────────

export const tiers = pgTable(
  'tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    nom: text('nom').notNull(),
    natureTiers: natureTiers('nature_tiers').notNull(),
    nomGerant: text('nom_gerant'),
    telPortableGerant: text('tel_portable_gerant'),
    siret: text('siret'),
    nTvaIntra: text('n_tva_intra'),
    email: text('email'),
    telephone: text('telephone'),
    adresseLigne1: text('adresse_ligne1'),
    adresseLigne2: text('adresse_ligne2'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    pays: text('pays').notNull().default('France'),
    statutAgrement: statutAgrement('statut_agrement').notNull().default('a_creer'),
    dateAgrement: date('date_agrement'),
    dateRefus: date('date_refus'),
    motifRefus: text('motif_refus'),
    cdtResponsableId: text('cdt_responsable_id').references(() => utilisateurs.id, {
      onDelete: 'set null',
    }),
    managerCdtId: text('manager_cdt_id').references(() => utilisateurs.id, {
      onDelete: 'set null',
    }),
    actif: boolean('actif').notNull().default(true),
    dateSortie: date('date_sortie'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_tiers_code_active')
      .on(t.code)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_tiers_siret_active')
      .on(t.siret)
      .where(sql`deleted_at IS NULL AND siret IS NOT NULL`),
    index('idx_tiers_actif')
      .on(t.actif)
      .where(sql`deleted_at IS NULL`),
    index('idx_tiers_nature')
      .on(t.natureTiers)
      .where(sql`deleted_at IS NULL`),
    index('idx_tiers_statut_agrement')
      .on(t.statutAgrement)
      .where(sql`deleted_at IS NULL`),
    index('idx_tiers_cdt')
      .on(t.cdtResponsableId)
      .where(sql`deleted_at IS NULL`),
    index('idx_tiers_ville')
      .on(t.ville)
      .where(sql`deleted_at IS NULL`),
    index('idx_tiers_entreprise').on(t.entrepriseId),
    check('chk_tiers_code_format', sql`code ~ '^[A-Z0-9._-]{2,32}$'`),
    check('chk_tiers_nom_len', sql`char_length(nom) BETWEEN 2 AND 200`),
    check('chk_tiers_siret', sql`siret IS NULL OR siret ~ '^[0-9]{14}$'`),
    check(
      'chk_tiers_tva_intra',
      sql`n_tva_intra IS NULL OR n_tva_intra ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'`,
    ),
    check('chk_tiers_cp', sql`code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'`),
    check(
      'chk_tiers_actif_date',
      sql`(actif = true AND date_sortie IS NULL) OR (actif = false AND date_sortie IS NOT NULL)`,
    ),
    check(
      'chk_tiers_refus_coherence',
      sql`(statut_agrement IN ('refuse_auto','refuse_manuel') AND date_refus IS NOT NULL) OR (statut_agrement NOT IN ('refuse_auto','refuse_manuel') AND date_refus IS NULL)`,
    ),
    check(
      'chk_tiers_agrement_coherence',
      sql`(statut_agrement = 'agree' AND date_agrement IS NOT NULL) OR (statut_agrement <> 'agree')`,
    ),
  ],
);

export type Tier = typeof tiers.$inferSelect;
export type NouveauTier = typeof tiers.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Jointures tier × corps d'état / société autorisée
// ─────────────────────────────────────────────────────────────

export const tierCorpsEtat = pgTable(
  'tier_corps_etat',
  {
    tierId: uuid('tier_id')
      .notNull()
      .references(() => tiers.id, { onDelete: 'cascade' }),
    corpsEtatId: uuid('corps_etat_id')
      .notNull()
      .references(() => corpsEtat.id, { onDelete: 'restrict' }),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.tierId, t.corpsEtatId] }),
    index('idx_tier_corps_etat_corps').on(t.corpsEtatId),
    index('idx_tier_corps_etat_entreprise').on(t.entrepriseId),
  ],
);

export type TierCorpsEtat = typeof tierCorpsEtat.$inferSelect;

export const tierSocietesAutorisees = pgTable(
  'tier_societes_autorisees',
  {
    tierId: uuid('tier_id')
      .notNull()
      .references(() => tiers.id, { onDelete: 'cascade' }),
    societeId: uuid('societe_id')
      .notNull()
      .references(() => societes.id, { onDelete: 'restrict' }),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  },
  (t) => [
    primaryKey({ columns: [t.tierId, t.societeId] }),
    index('idx_tier_societes_societe').on(t.societeId),
    index('idx_tier_societes_autorisees_entreprise').on(t.entrepriseId),
  ],
);

export type TierSocieteAutorisee = typeof tierSocietesAutorisees.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Documents administratifs attachés à un tier (stockés en MinIO)
// ─────────────────────────────────────────────────────────────

export const tierDocuments = pgTable(
  'tier_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tierId: uuid('tier_id')
      .notNull()
      .references(() => tiers.id, { onDelete: 'cascade' }),
    natureDocumentId: uuid('nature_document_id')
      .notNull()
      .references(() => naturesDocument.id, { onDelete: 'restrict' }),
    minioKey: text('minio_key'),
    nomFichierOrigine: text('nom_fichier_origine'),
    mimeType: text('mime_type'),
    tailleBytes: bigint('taille_bytes', { mode: 'number' }),
    dateObtention: date('date_obtention'),
    dateFinValidite: date('date_fin_validite'),
    statut: statutDocumentTier('statut').notNull().default('en_attente_validation'),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    validatedBy: text('validated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    motifRefus: text('motif_refus'),
    notes: text('notes'),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_tier_documents_tier')
      .on(t.tierId)
      .where(sql`deleted_at IS NULL`),
    index('idx_tier_documents_nature')
      .on(t.natureDocumentId)
      .where(sql`deleted_at IS NULL`),
    index('idx_tier_documents_validite')
      .on(t.dateFinValidite)
      .where(sql`deleted_at IS NULL`),
    index('idx_tier_documents_statut')
      .on(t.statut)
      .where(sql`deleted_at IS NULL`),
    index('idx_tier_documents_tier_nature')
      .on(t.tierId, t.natureDocumentId)
      .where(sql`deleted_at IS NULL`),
    index('idx_tier_documents_entreprise').on(t.entrepriseId),
    check('chk_tier_documents_taille', sql`taille_bytes IS NULL OR taille_bytes > 0`),
    check(
      'chk_tier_documents_refus_motif',
      sql`(statut <> 'refuse') OR (motif_refus IS NOT NULL AND char_length(motif_refus) > 0)`,
    ),
  ],
);

export type TierDocument = typeof tierDocuments.$inferSelect;
export type NouveauTierDocument = typeof tierDocuments.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Traces de relances d'agrément (table conservée pour cohérence ;
// le moteur de relances automatiques est hors périmètre / non utilisé).
// ─────────────────────────────────────────────────────────────

export const tierAgrementRelances = pgTable(
  'tier_agrement_relances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tierId: uuid('tier_id')
      .notNull()
      .references(() => tiers.id, { onDelete: 'cascade' }),
    tierDocumentId: uuid('tier_document_id').references(() => tierDocuments.id, {
      onDelete: 'set null',
    }),
    contexte: contexteRelanceAgrement('contexte').notNull(),
    niveau: niveauRelanceAgrement('niveau').notNull(),
    envoyeLe: timestamp('envoye_le', { withTimezone: true }).notNull().defaultNow(),
    jourEnvoi: date('jour_envoi').notNull(),
    destinataires: text('destinataires')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    cc: text('cc')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sujet: text('sujet').notNull(),
    corps: text('corps').notNull(),
    referenceExterne: text('reference_externe'),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('uq_tier_agrement_relances_idempotence').on(
      t.tierId,
      t.contexte,
      t.niveau,
      sql`COALESCE(tier_document_id, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.jourEnvoi,
    ),
    index('idx_tier_agrement_relances_tier').on(t.tierId, t.envoyeLe.desc()),
    index('idx_tier_agrement_relances_entreprise').on(t.entrepriseId),
  ],
);

export type TierAgrementRelance = typeof tierAgrementRelances.$inferSelect;
