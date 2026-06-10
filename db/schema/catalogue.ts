import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

/**
 * M2.1-bis : refonte selon le prompt « Articles Composés » (adaptation BTP).
 *
 * Le modèle unifie familles d'ouvrage et familles d'article en une seule table
 * hiérarchique `familles`. Les ouvrages composés et les articles simples vivent
 * dans la même table `articles`, distingués par leur `type` (simple, compose,
 * prestation, operation).
 *
 * Nomenclatures + versioning + prix historisés → M2.2 et M2.3.
 */

// ─────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────

export const uniteType = pgEnum('unite_type', [
  'masse',
  'longueur',
  'surface',
  'volume',
  'unitaire',
  'temps',
  'autre',
]);

export const articleType = pgEnum('article_type', [
  'simple',
  'compose',
  'prestation',
  'operation',
]);

// ─────────────────────────────────────────────────────────────
// Unités
// ─────────────────────────────────────────────────────────────

export const unites = pgTable(
  'unites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    libelle: text('libelle').notNull(),
    symbole: text('symbole').notNull(),
    type: uniteType('type').notNull(),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('idx_unites_type').on(t.type)],
);

export type Unite = typeof unites.$inferSelect;
export type NouvelleUnite = typeof unites.$inferInsert;

/**
 * Conversions entre unités du **même type** (ex: 1 KG = 1000 G, 1 H = 60 MIN).
 * Les conversions cross-type (M² → KG via densité/épaisseur) sont calculées au
 * niveau de l'article (caractéristiques physiques), pas ici.
 */
export const uniteConversions = pgTable(
  'unite_conversions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uniteSourceId: uuid('unite_source_id')
      .notNull()
      .references(() => unites.id, { onDelete: 'cascade' }),
    uniteCibleId: uuid('unite_cible_id')
      .notNull()
      .references(() => unites.id, { onDelete: 'cascade' }),
    facteur: numeric('facteur', { precision: 18, scale: 8 }).notNull(),
  },
  (t) => [unique('uq_unite_conversions_pair').on(t.uniteSourceId, t.uniteCibleId)],
);

// ─────────────────────────────────────────────────────────────
// Familles (hiérarchique récursive)
// ─────────────────────────────────────────────────────────────

export const familles = pgTable(
  'familles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    libelle: text('libelle').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => familles.id, {
      onDelete: 'restrict',
    }),
    description: text('description'),
    ordre: integer('ordre').notNull().default(0),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_familles_parent').on(t.parentId),
    index('idx_familles_entreprise').on(t.entrepriseId),
  ],
);

export type Famille = typeof familles.$inferSelect;
export type NouvelleFamille = typeof familles.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Articles (simple / composé / prestation / opération)
// ─────────────────────────────────────────────────────────────

export const articles = pgTable(
  'articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    libelle: text('libelle').notNull(),
    familleId: uuid('famille_id')
      .notNull()
      .references(() => familles.id, { onDelete: 'restrict' }),
    type: articleType('type').notNull().default('simple'),

    // Triple unité (peut être identique). NULL autorisé pour les prestations
    // ou cas exotiques — l'UI pousse à les renseigner.
    uniteAchatId: uuid('unite_achat_id').references(() => unites.id, { onDelete: 'restrict' }),
    uniteStockId: uuid('unite_stock_id').references(() => unites.id, { onDelete: 'restrict' }),
    uniteVenteId: uuid('unite_vente_id').references(() => unites.id, { onDelete: 'restrict' }),

    // Fournisseur préféré (M2.2). Si défini, son prix est utilisé en priorité
    // dans le calcul de prix de revient (cf. fonction PG prix_courant_article).
    fournisseurPrefereId: uuid('fournisseur_prefere_id').references((): AnyPgColumn => fournisseurs.id, {
      onDelete: 'set null',
    }),

    // Caractéristiques physiques pour la conversion cross-type (M² ↔ KG, etc.)
    densite: numeric('densite', { precision: 10, scale: 4 }),
    epaisseur: numeric('epaisseur', { precision: 10, scale: 4 }),
    longueurStd: numeric('longueur_std', { precision: 10, scale: 4 }),
    largeurStd: numeric('largeur_std', { precision: 10, scale: 4 }),

    description: text('description'),
    actif: boolean('actif').notNull().default(true),
    // Favori (niveau entreprise) : marque les références fréquentes pour les
    // remonter en tête du catalogue (étoile, cf. maquette 07). Migration 0056.
    favori: boolean('favori').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_articles_famille').on(t.familleId),
    index('idx_articles_type').on(t.type),
    index('idx_articles_favori').on(t.favori).where(sql`favori = true`),
  ],
);

export type Article = typeof articles.$inferSelect;
export type NouvelArticle = typeof articles.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Fournisseurs (inchangé depuis M2.1 — câblage tarifs en M2.3)
// ─────────────────────────────────────────────────────────────

export const fournisseurs = pgTable(
  'fournisseurs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    nom: text('nom').notNull(),
    siret: text('siret'),
    email: text('email'),
    telephone: text('telephone'),
    adresseLigne1: text('adresse_ligne1'),
    adresseLigne2: text('adresse_ligne2'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    pays: text('pays').notNull().default('France'),
    actif: boolean('actif').notNull().default(true),
    dateSortie: date('date_sortie'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_fournisseurs_actif').on(t.actif),
    index('idx_fournisseurs_ville').on(t.ville),
    check('chk_fournisseurs_cp', sql`code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'`),
  ],
);

export type Fournisseur = typeof fournisseurs.$inferSelect;
export type NouveauFournisseur = typeof fournisseurs.$inferInsert;

// Contacts multiples par fournisseur (commercial, comptable, technique…).
// Soft-delete via `deleted_at` + statut `actif` permettant la désactivation
// sans perte de l'historique de référence. Un seul `principal` actif autorisé
// (index unique partiel).
export const fournisseurContacts = pgTable(
  'fournisseur_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    fournisseurId: uuid('fournisseur_id')
      .notNull()
      .references(() => fournisseurs.id, { onDelete: 'cascade' }),
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
    index('idx_fournisseur_contacts_fournisseur').on(t.fournisseurId),
    index('idx_fournisseur_contacts_actif').on(t.fournisseurId, t.actif),
    uniqueIndex('uq_fournisseur_contacts_principal')
      .on(t.fournisseurId)
      .where(sql`principal = true AND deleted_at IS NULL`),
  ],
);

export type FournisseurContact = typeof fournisseurContacts.$inferSelect;
export type NouveauFournisseurContact = typeof fournisseurContacts.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Nomenclatures versionnées — M2.2
// ─────────────────────────────────────────────────────────────

export const nomenclatures = pgTable(
  'nomenclatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    libelle: text('libelle'),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  },
  (t) => [
    unique('uq_nomenclatures_article_version').on(t.articleId, t.version),
    uniqueIndex('uq_nomenclatures_article_active')
      .on(t.articleId)
      .where(sql`valid_to IS NULL`),
    index('idx_nomenclatures_article').on(t.articleId),
  ],
);

export type Nomenclature = typeof nomenclatures.$inferSelect;
export type NouvelleNomenclature = typeof nomenclatures.$inferInsert;

export const nomenclatureLignes = pgTable(
  'nomenclature_lignes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    nomenclatureId: uuid('nomenclature_id')
      .notNull()
      .references(() => nomenclatures.id, { onDelete: 'cascade' }),
    ordre: integer('ordre').notNull().default(0),
    composantArticleId: uuid('composant_article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'restrict' }),
    quantite: numeric('quantite', { precision: 14, scale: 4 }).notNull(),
    uniteEmploiId: uuid('unite_emploi_id')
      .notNull()
      .references(() => unites.id, { onDelete: 'restrict' }),
    coefficientPerte: numeric('coefficient_perte', { precision: 5, scale: 4 }).notNull().default('0'),
    notes: text('notes'),
  },
  (t) => [
    index('idx_nomenclature_lignes_nomenclature').on(t.nomenclatureId),
    index('idx_nomenclature_lignes_composant').on(t.composantArticleId),
    check('chk_nom_lignes_quantite_pos', sql`quantite > 0`),
    check('chk_nom_lignes_perte_range', sql`coefficient_perte >= 0 AND coefficient_perte < 1`),
  ],
);

export type NomenclatureLigne = typeof nomenclatureLignes.$inferSelect;
export type NouvelleNomenclatureLigne = typeof nomenclatureLignes.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Prix d'articles — historique multi-fournisseurs — M2.2/M2.3
// ─────────────────────────────────────────────────────────────

export const prixArticles = pgTable(
  'prix_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'cascade' }),
    prixUnitaireHt: numeric('prix_unitaire_ht', { precision: 14, scale: 2 }).notNull(),
    uniteId: uuid('unite_id')
      .notNull()
      .references(() => unites.id, { onDelete: 'restrict' }),
    /**
     * NULL = prix de référence générique (catalogue interne).
     * Sinon = prix négocié chez ce fournisseur.
     */
    fournisseurId: uuid('fournisseur_id').references(() => fournisseurs.id, { onDelete: 'set null' }),
    referenceFournisseur: text('reference_fournisseur'),
    quantiteMin: numeric('quantite_min', { precision: 14, scale: 4 }),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('idx_prix_articles_article_date').on(t.articleId, t.validFrom.desc()),
    index('idx_prix_articles_article_fournisseur').on(t.articleId, t.fournisseurId),
    check('chk_prix_articles_prix_pos', sql`prix_unitaire_ht >= 0`),
    check('chk_prix_articles_dates', sql`valid_to IS NULL OR valid_to >= valid_from`),
  ],
);

export type PrixArticle = typeof prixArticles.$inferSelect;
export type NouveauPrixArticle = typeof prixArticles.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Grilles tarifaires fournisseur — M2.4
// ─────────────────────────────────────────────────────────────

/**
 * Une grille tarifaire = un tarif négocié avec un fournisseur, regroupant
 * N articles sous une même période de validité (ex : « Tarif POINT.P 2026 »).
 *
 * Coexiste avec `prix_articles` qui reste pour les prix ponctuels et
 * l'historisation fine. Le calcul du prix courant (fonction PG
 * `prix_courant_article`) combine grilles et `prix_articles` selon un ordre
 * de priorité précis — le prix de référence (`prix_articles.fournisseur_id IS
 * NULL`) prime dès qu'il est renseigné (cf. migration 0067 / ADR 009).
 */
export const grillesTarifaires = pgTable(
  'grilles_tarifaires',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    fournisseurId: uuid('fournisseur_id')
      .notNull()
      .references(() => fournisseurs.id, { onDelete: 'restrict' }),
    // Rattachement optionnel à un chantier : si défini, la grille est
    // négociée pour ce chantier précis et devient prioritaire sur les
    // grilles "générales" du fournisseur dans prix_courant_article.
    chantierId: uuid('chantier_id'),
    libelle: text('libelle').notNull(),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
    actif: boolean('actif').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_grilles_tarifaires_fournisseur').on(t.fournisseurId, t.validFrom.desc()),
    index('idx_grilles_tarifaires_chantier').on(t.chantierId),
    check('chk_grilles_tarifaires_dates', sql`valid_to IS NULL OR valid_to >= valid_from`),
  ],
);

export type GrilleTarifaire = typeof grillesTarifaires.$inferSelect;
export type NouvelleGrilleTarifaire = typeof grillesTarifaires.$inferInsert;

export const grilleTarifaireLignes = pgTable(
  'grille_tarifaire_lignes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    grilleId: uuid('grille_id')
      .notNull()
      .references(() => grillesTarifaires.id, { onDelete: 'cascade' }),
    articleId: uuid('article_id')
      .notNull()
      .references(() => articles.id, { onDelete: 'restrict' }),
    prixUnitaireHt: numeric('prix_unitaire_ht', { precision: 14, scale: 2 }).notNull(),
    uniteId: uuid('unite_id')
      .notNull()
      .references(() => unites.id, { onDelete: 'restrict' }),
    referenceFournisseur: text('reference_fournisseur'),
    quantiteMin: numeric('quantite_min', { precision: 14, scale: 4 }),
    notes: text('notes'),
  },
  (t) => [
    unique('uq_grille_lignes_grille_article').on(t.grilleId, t.articleId),
    index('idx_grille_lignes_grille').on(t.grilleId),
    index('idx_grille_lignes_article').on(t.articleId),
    check('chk_grille_lignes_prix_pos', sql`prix_unitaire_ht >= 0`),
    check('chk_grille_lignes_qmin_pos', sql`quantite_min IS NULL OR quantite_min > 0`),
  ],
);

export type GrilleTarifaireLigne = typeof grilleTarifaireLignes.$inferSelect;
export type NouvelleGrilleTarifaireLigne = typeof grilleTarifaireLignes.$inferInsert;
