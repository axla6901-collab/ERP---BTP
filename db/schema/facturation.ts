import {
  bigint,
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
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { articles } from './catalogue';
import { chantiers } from './chantiers';
import { clients, devis } from './commercial';
import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

/**
 * M6 — Facturation BTP.
 *
 * Couvre deux modes :
 *   1. Facture directe (forfait, hors situation) — lignes libres comme un devis.
 *   2. Facture sur situation d'avancement (modèle CUMULÉ — CCAG-T) :
 *      situations séquentielles par chantier, % cumulé saisi manuellement,
 *      delta calculé, génération facture en 1 clic.
 *
 * generate_numero('facture') produit des numéros F-<année>-000XXX.
 */

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export const statutFacture = pgEnum('statut_facture', [
  'brouillon',
  'emise',
  'payee',
  'en_retard',
  'annulee',
]);

export const statutSituation = pgEnum('statut_situation', [
  'brouillon',
  'validee',
  'facturee',
  'annulee',
]);

export const typeLigneFacture = pgEnum('type_ligne_facture', [
  'section',
  'article_catalogue',
  'libre',
]);

// ─────────────────────────────────────────────────────────────
// Factures
// ─────────────────────────────────────────────────────────────

export const factures = pgTable(
  'factures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    numero: text('numero').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    chantierId: uuid('chantier_id').references(() => chantiers.id, { onDelete: 'set null' }),
    devisId: uuid('devis_id').references(() => devis.id, { onDelete: 'set null' }),
    dateFacture: date('date_facture').notNull().defaultNow(),
    dateEcheance: date('date_echeance'),
    delaiPaiementJours: integer('delai_paiement_jours'),
    statut: statutFacture('statut').notNull().default('brouillon'),
    objet: text('objet'),
    conditionsPaiement: text('conditions_paiement'),
    mentionsLegales: text('mentions_legales'),
    notes: text('notes'),
    totalHt: numeric('total_ht', { precision: 14, scale: 2 }).notNull().default('0'),
    totalTva: numeric('total_tva', { precision: 14, scale: 2 }).notNull().default('0'),
    totalTtc: numeric('total_ttc', { precision: 14, scale: 2 }).notNull().default('0'),
    detailsTva: jsonb('details_tva'),
    /** Remise globale appliquée sur le total HT : 'pourcent' | 'montant' | null. */
    remiseGlobaleType: text('remise_globale_type'),
    /** Valeur de la remise globale (% si type='pourcent', € si 'montant'). */
    remiseGlobaleValeur: numeric('remise_globale_valeur', { precision: 14, scale: 2 }),
    /** Auto-liquidation TVA BTP (art. 283-2 nonies CGI). */
    autoLiquidation: boolean('auto_liquidation').notNull().default(false),
    retenueGarantiePct: numeric('retenue_garantie_pct', { precision: 5, scale: 2 }),
    montantRetenue: numeric('montant_retenue', { precision: 14, scale: 2 }),
    dateEmission: timestamp('date_emission', { withTimezone: true }),
    datePaiement: date('date_paiement'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    unique('uq_factures_numero').on(t.numero),
    index('idx_factures_client').on(t.clientId),
    index('idx_factures_chantier').on(t.chantierId),
    index('idx_factures_devis').on(t.devisId),
    index('idx_factures_statut').on(t.statut),
    index('idx_factures_date').on(t.dateFacture.desc()),
    check(
      'chk_factures_retenue_pct',
      sql`retenue_garantie_pct IS NULL OR (retenue_garantie_pct >= 0 AND retenue_garantie_pct <= 10)`,
    ),
    check(
      'chk_factures_dates',
      sql`date_echeance IS NULL OR date_echeance >= date_facture`,
    ),
    check(
      'chk_factures_remise_globale',
      sql`remise_globale_type IS NULL OR (remise_globale_type IN ('pourcent','montant') AND remise_globale_valeur IS NOT NULL AND remise_globale_valeur > 0 AND (remise_globale_type <> 'pourcent' OR remise_globale_valeur <= 100))`,
    ),
  ],
);

export type Facture = typeof factures.$inferSelect;
export type NouvelleFacture = typeof factures.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Lignes de facture
// ─────────────────────────────────────────────────────────────

export const lignesFacture = pgTable(
  'lignes_facture',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    factureId: uuid('facture_id')
      .notNull()
      .references(() => factures.id, { onDelete: 'cascade' }),
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
  (t) => [index('idx_lignes_facture_facture').on(t.factureId, t.ordre)],
);

export type LigneFacture = typeof lignesFacture.$inferSelect;
export type NouvelleLigneFacture = typeof lignesFacture.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Situations de travaux
// ─────────────────────────────────────────────────────────────

export const situationsTravaux = pgTable(
  'situations_travaux',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    chantierId: uuid('chantier_id')
      .notNull()
      .references(() => chantiers.id, { onDelete: 'restrict' }),
    /** Devis source (optionnel) : si renseigné, les lignes ont été
     *  initialisées depuis ce devis accepté. Sert à la traçabilité. */
    devisId: uuid('devis_id').references(() => devis.id, { onDelete: 'set null' }),
    numero: integer('numero').notNull(),
    dateSituation: date('date_situation').notNull().defaultNow(),
    pctAvancementCumule: numeric('pct_avancement_cumule', { precision: 5, scale: 2 }).notNull(),
    montantMarcheHt: numeric('montant_marche_ht', { precision: 14, scale: 2 }).notNull(),
    montantCumuleHt: numeric('montant_cumule_ht', { precision: 14, scale: 2 }).notNull(),
    montantSituationPrecedenteHt: numeric('montant_situation_precedente_ht', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    montantAFacturerHt: numeric('montant_a_facturer_ht', { precision: 14, scale: 2 }).notNull(),
    tauxTva: numeric('taux_tva', { precision: 5, scale: 2 }).notNull().default('20.00'),
    /** Remise globale appliquée sur le « à facturer HT » : 'pourcent' | 'montant' | null. */
    remiseGlobaleType: text('remise_globale_type'),
    /** Valeur de la remise globale (% si type='pourcent', € si 'montant'). */
    remiseGlobaleValeur: numeric('remise_globale_valeur', { precision: 14, scale: 2 }),
    statut: statutSituation('statut').notNull().default('brouillon'),
    factureId: uuid('facture_id').references(() => factures.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    unique('uq_situations_chantier_numero').on(t.chantierId, t.numero),
    index('idx_situations_chantier').on(t.chantierId, t.numero.desc()),
    index('idx_situations_statut').on(t.statut),
    check(
      'chk_situations_pct_range',
      sql`pct_avancement_cumule > 0 AND pct_avancement_cumule <= 100`,
    ),
    check('chk_situations_marche_pos', sql`montant_marche_ht > 0`),
    check(
      'chk_situations_remise_globale',
      sql`remise_globale_type IS NULL OR (remise_globale_type IN ('pourcent','montant') AND remise_globale_valeur IS NOT NULL AND remise_globale_valeur > 0 AND (remise_globale_type <> 'pourcent' OR remise_globale_valeur <= 100))`,
    ),
  ],
);

export type SituationTravaux = typeof situationsTravaux.$inferSelect;
export type NouvelleSituationTravaux = typeof situationsTravaux.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Lignes de situation (un poste par ligne, chacun avec son %)
// ─────────────────────────────────────────────────────────────

export const lignesSituation = pgTable(
  'lignes_situation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    situationId: uuid('situation_id')
      .notNull()
      .references(() => situationsTravaux.id, { onDelete: 'cascade' }),
    ordre: integer('ordre').notNull(),
    /** Lien vers la ligne équivalente de la situation précédente. */
    lignePrecedenteId: uuid('ligne_precedente_id'),
    designation: text('designation').notNull(),
    /** Enrichissement optionnel à un article du catalogue. */
    articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
    /** Mode hybride : qty + PU OU montant_marche_ht direct. */
    quantite: numeric('quantite', { precision: 14, scale: 4 }),
    unite: text('unite'),
    prixUnitaireHt: numeric('prix_unitaire_ht', { precision: 14, scale: 2 }),
    montantMarcheHt: numeric('montant_marche_ht', { precision: 14, scale: 2 }).notNull(),
    pctAvancementCumule: numeric('pct_avancement_cumule', { precision: 5, scale: 2 }).notNull(),
    montantCumuleHt: numeric('montant_cumule_ht', { precision: 14, scale: 2 }).notNull(),
    montantSituationPrecedenteHt: numeric('montant_situation_precedente_ht', {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default('0'),
    montantAFacturerHt: numeric('montant_a_facturer_ht', { precision: 14, scale: 2 }).notNull(),
    notes: text('notes'),
  },
  (t) => [
    index('idx_lignes_situation_situation').on(t.situationId, t.ordre),
    check(
      'chk_lignes_situation_pct_range',
      sql`pct_avancement_cumule >= 0 AND pct_avancement_cumule <= 100`,
    ),
    check('chk_lignes_situation_marche_pos', sql`montant_marche_ht > 0`),
  ],
);

export type LigneSituation = typeof lignesSituation.$inferSelect;
export type NouvelleLigneSituation = typeof lignesSituation.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Factur-X générés (archivage légal — migration 0061)
// ─────────────────────────────────────────────────────────────
//   Chaque génération de facture électronique (PDF/A-3 + XML CII EN 16931)
//   produit une ligne ici. Le binaire vit en MinIO (`minioKey`,
//   cf. lib/storage/s3.ts) ; la table ne porte que les métadonnées + empreinte.
//   Soft-delete : régénérer en brouillon « remplace » l'ancien (deleted_at) sans
//   l'écraser. RLS tenant alignée (cf. migration 0043/0059).

export const factureDocuments = pgTable(
  'facture_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    factureId: uuid('facture_id')
      .notNull()
      .references(() => factures.id, { onDelete: 'cascade' }),
    /** Profil Factur-X du fichier (en16931, basic, …). */
    profil: text('profil').notNull().default('en16931'),
    minioKey: text('minio_key').notNull(),
    mimeType: text('mime_type').notNull().default('application/pdf'),
    tailleBytes: bigint('taille_bytes', { mode: 'number' }),
    /** Empreinte SHA-256 (hex) du PDF, pour l'intégrité de l'archive. */
    sha256: text('sha256'),
    /** true si le XML a passé la validation XSD (best-effort). */
    xmlValide: boolean('xml_valide').notNull().default(false),
    genereAt: timestamp('genere_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_facture_documents_facture').on(t.factureId, t.genereAt.desc()),
    index('idx_facture_documents_entreprise').on(t.entrepriseId),
    check(
      'chk_facture_documents_taille',
      sql`taille_bytes IS NULL OR taille_bytes > 0`,
    ),
  ],
);

export type FactureDocument = typeof factureDocuments.$inferSelect;
export type NouveauFactureDocument = typeof factureDocuments.$inferInsert;
