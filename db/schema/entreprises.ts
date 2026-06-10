import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { encryptedText } from '@/lib/crypto/encrypted-column';

import { roles } from './rbac';
import { utilisateurs } from './utilisateurs';

export const entreprises = pgTable(
  'entreprises',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    raisonSociale: text('raison_sociale').notNull(),
    siret: text('siret'),
    tvaIntracom: text('tva_intracom'),
    adresseLigne1: text('adresse_ligne1'),
    adresseLigne2: text('adresse_ligne2'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    pays: text('pays').notNull().default('France'),
    // Coordonnées légales & bancaires (facturation électronique — migration 0061).
    // Nullables : la complétude est exigée à la génération Factur-X, pas en base.
    /** IBAN émetteur (moyen de paiement « virement » du XML, BT-84). Chiffré applicativement (bytea). */
    iban: encryptedText('iban'),
    /** BIC/SWIFT émetteur (BT-86). Chiffré applicativement (bytea). */
    bic: encryptedText('bic'),
    /** Mention RCS (ex. « RCS Lyon B 123 456 789 ») — PDF visuel. */
    rcs: text('rcs'),
    /** Forme juridique (SARL, SAS, EI…) — PDF visuel. */
    formeJuridique: text('forme_juridique'),
    /** Capital social en euros — PDF visuel. */
    capitalSocial: numeric('capital_social', { precision: 14, scale: 2 }),
    /** Code APE/NAF (ex. 4399C) — PDF visuel. */
    codeApe: text('code_ape'),
    logoUrl: text('logo_url'),
    actif: boolean('actif').notNull().default(true),
    /** Option Planning (module Gantt). Bascule par l'admin tenant — cf. migration 0053. */
    planningActive: boolean('planning_active').notNull().default(false),
    /** Option Référencement & Agrément des tiers. Bascule par l'admin tenant — cf. migration 0059. */
    tiersReferencementActive: boolean('tiers_referencement_active').notNull().default(false),
    /** Option Compte prorata (NF P03-001). Bascule par l'admin tenant — cf. migration 0062. */
    compteProrataActive: boolean('compte_prorata_active').notNull().default(false),
    /** Option Sous-traitance (contrats ST + factures ST). Bascule par l'admin tenant — cf. migration 0066. */
    sousTraitanceActive: boolean('sous_traitance_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    uqSlugActive: uniqueIndex('uq_entreprises_slug_active')
      .on(t.slug)
      .where(sql`deleted_at IS NULL`),
  }),
);

export const utilisateurEntreprises = pgTable(
  'utilisateur_entreprises',
  {
    utilisateurId: text('utilisateur_id')
      .notNull()
      .references(() => utilisateurs.id, { onDelete: 'cascade' }),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.utilisateurId, t.entrepriseId] }),
    uqDefault: uniqueIndex('uq_user_entreprise_default')
      .on(t.utilisateurId)
      .where(sql`is_default AND deleted_at IS NULL`),
  }),
);

export type Entreprise = typeof entreprises.$inferSelect;
export type NouvelleEntreprise = typeof entreprises.$inferInsert;
export type UtilisateurEntreprise = typeof utilisateurEntreprises.$inferSelect;
export type NouveauUtilisateurEntreprise = typeof utilisateurEntreprises.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Logos entreprise (principal + certifications type RGE)
// ─────────────────────────────────────────────────────────────
//   - type 'principal'      : 1 seul actif par entreprise
//   - type 'certification'  : 0..N (RGE, Qualibat, ...), ordonnés par `ordre`
// Le binaire est stocké dans S3/MinIO (cf. lib/storage/s3.ts) ; la table
// ne contient que la clé S3 et les métadonnées.

export const entrepriseLogos = pgTable(
  'entreprise_logos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'cascade' }),
    type: text('type').notNull().$type<'principal' | 'certification'>(),
    libelle: text('libelle').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull(),
    tailleOctets: integer('taille_octets').notNull(),
    largeurPx: integer('largeur_px'),
    hauteurPx: integer('hauteur_px'),
    ordre: integer('ordre').notNull().default(0),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    uqPrincipalActif: uniqueIndex('uq_entreprise_logo_principal')
      .on(t.entrepriseId)
      .where(sql`type = 'principal' AND deleted_at IS NULL`),
    idxParType: index('idx_entreprise_logos_entreprise_type')
      .on(t.entrepriseId, t.type, t.ordre)
      .where(sql`deleted_at IS NULL`),
  }),
);

export type EntrepriseLogo = typeof entrepriseLogos.$inferSelect;
export type NouveauEntrepriseLogo = typeof entrepriseLogos.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Conditions Générales (CGV / CGA) versionnées
// ─────────────────────────────────────────────────────────────
//   - Chaque enregistrement = une version juridique (date d'effet).
//   - Le contenu est sauvegardé en HTML (rendu Tiptap) et JSON (ré-édition).
//   - La "version active" est calculée côté app : version la plus récente
//     dont date_effet <= now() (ou la plus récente si toutes futures).

export const entrepriseConditions = pgTable(
  'entreprise_conditions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'cascade' }),
    type: text('type').notNull().$type<'cgv' | 'cga'>(),
    version: integer('version').notNull(),
    contenuHtml: text('contenu_html').notNull(),
    contenuJson: jsonb('contenu_json'),
    dateEffet: date('date_effet').notNull(),
    commentaire: text('commentaire'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    uqVersion: uniqueIndex('uq_entreprise_conditions_version')
      .on(t.entrepriseId, t.type, t.version)
      .where(sql`deleted_at IS NULL`),
    idxActuelle: index('idx_entreprise_conditions_actuelle')
      .on(t.entrepriseId, t.type, t.dateEffet.desc(), t.version.desc())
      .where(sql`deleted_at IS NULL`),
  }),
);

export type EntrepriseCondition = typeof entrepriseConditions.$inferSelect;
export type NouvelleEntrepriseCondition = typeof entrepriseConditions.$inferInsert;
