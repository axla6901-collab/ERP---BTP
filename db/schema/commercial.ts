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
import { articles } from './catalogue';

// ─────────────────────────────────────────────────────────────
// Enums M3.1
// ─────────────────────────────────────────────────────────────

export const typeClient = pgEnum('type_client', ['particulier', 'professionnel']);

export const statutDevis = pgEnum('statut_devis', [
  'brouillon',
  'en_validation',
  'refuse',
  'valide',
  'envoye',
  'gagne',
  'perdu',
  'annule',
]);

export const typeLigneDevis = pgEnum('type_ligne_devis', ['section', 'article_catalogue', 'libre']);

// ─────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    type: typeClient('type').notNull(),
    raisonSociale: text('raison_sociale'),
    nom: text('nom'),
    prenom: text('prenom'),
    siret: text('siret'),
    tvaIntra: text('tva_intra'),
    email: text('email'),
    telephone: text('telephone'),
    adresseLigne1: text('adresse_ligne1').notNull(),
    adresseLigne2: text('adresse_ligne2'),
    codePostal: text('code_postal').notNull(),
    ville: text('ville').notNull(),
    pays: text('pays').notNull().default('France'),
    notes: text('notes'),
    actif: boolean('actif').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_clients_ville').on(t.ville),
    check(
      'chk_clients_type_cohesion',
      sql`(type = 'particulier' AND nom IS NOT NULL) OR (type = 'professionnel' AND raison_sociale IS NOT NULL)`,
    ),
    check('chk_clients_siret', sql`siret IS NULL OR siret ~ '^[0-9]{14}$'`),
    check('chk_clients_cp', sql`code_postal ~ '^[0-9]{5}$'`),
  ],
);

export type Client = typeof clients.$inferSelect;
export type NouveauClient = typeof clients.$inferInsert;

// Contacts multiples par client (commercial, technique, comptable…). Mêmes règles
// que pour les fournisseurs / sous-traitants : soft-delete via `deleted_at`,
// statut `actif` + un seul `principal` actif (index unique partiel). La table
// naît directement avec entreprise_id (migration 0052).
export const clientContacts = pgTable(
  'client_contacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
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
    index('idx_client_contacts_client').on(t.clientId),
    index('idx_client_contacts_actif').on(t.clientId, t.actif),
    index('idx_client_contacts_entreprise').on(t.entrepriseId),
    uniqueIndex('uq_client_contacts_principal')
      .on(t.clientId)
      .where(sql`principal = true AND deleted_at IS NULL`),
  ],
);

export type ClientContact = typeof clientContacts.$inferSelect;
export type NouveauClientContact = typeof clientContacts.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Devis
// ─────────────────────────────────────────────────────────────

export const devis = pgTable(
  'devis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    numero: text('numero').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    chantierId: uuid('chantier_id'), // placeholder M4 — pas de FK encore
    dateDevis: date('date_devis').notNull().defaultNow(),
    dateValidite: date('date_validite').notNull(),
    statut: statutDevis('statut').notNull().default('brouillon'),
    objet: text('objet'),
    conditionsGenerales: text('conditions_generales'),
    notes: text('notes'),
    totalHt: numeric('total_ht', { precision: 14, scale: 2 }).notNull().default('0'),
    totalTva: numeric('total_tva', { precision: 14, scale: 2 }).notNull().default('0'),
    totalTtc: numeric('total_ttc', { precision: 14, scale: 2 }).notNull().default('0'),
    detailsTva: jsonb('details_tva'),
    /** Remise globale appliquée sur le total HT : 'pourcent' | 'montant' | null. */
    remiseGlobaleType: text('remise_globale_type'),
    /** Valeur de la remise globale (% si type='pourcent', € si 'montant'). */
    remiseGlobaleValeur: numeric('remise_globale_valeur', { precision: 14, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_devis_client').on(t.clientId),
    index('idx_devis_statut').on(t.statut),
    index('idx_devis_date').on(t.dateDevis.desc()),
    check(
      'chk_devis_remise_globale',
      sql`remise_globale_type IS NULL OR (remise_globale_type IN ('pourcent','montant') AND remise_globale_valeur IS NOT NULL AND remise_globale_valeur > 0 AND (remise_globale_type <> 'pourcent' OR remise_globale_valeur <= 100))`,
    ),
  ],
);

export type Devis = typeof devis.$inferSelect;
export type NouveauDevis = typeof devis.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Lignes de devis
// ─────────────────────────────────────────────────────────────

export const lignesDevis = pgTable(
  'lignes_devis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    devisId: uuid('devis_id')
      .notNull()
      .references(() => devis.id, { onDelete: 'cascade' }),
    ordre: integer('ordre').notNull(),
    type: typeLigneDevis('type').notNull(),
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
    /** True si la ligne (typ. une section) provient d'un import DPGF.
     *  Sert à interdire la suppression côté éditeur : seules les sections
     *  créées manuellement sont supprimables. */
    origineDpgf: boolean('origine_dpgf').notNull().default(false),
  },
  (t) => [
    index('idx_lignes_devis_devis').on(t.devisId, t.ordre),
    check(
      'chk_lignes_devis_type_section',
      sql`(type = 'section' AND quantite IS NULL AND prix_unitaire_ht IS NULL AND taux_tva IS NULL)
         OR (type <> 'section' AND quantite IS NOT NULL AND prix_unitaire_ht IS NOT NULL AND taux_tva IS NOT NULL)`,
    ),
    check(
      'chk_lignes_devis_type_article',
      sql`(type = 'article_catalogue' AND article_id IS NOT NULL)
         OR (type <> 'article_catalogue' AND article_id IS NULL)`,
    ),
  ],
);

export type LigneDevis = typeof lignesDevis.$inferSelect;
export type NouvelleLigneDevis = typeof lignesDevis.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Postes internes (ventilés sur les lignes du devis)
// ─────────────────────────────────────────────────────────────

export const porteePosteInterne = pgEnum('portee_poste_interne', ['devis', 'chapitre']);

export const postesInternesDevis = pgTable(
  'postes_internes_devis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    devisId: uuid('devis_id')
      .notNull()
      .references(() => devis.id, { onDelete: 'cascade' }),
    ordre: integer('ordre').notNull(),
    libelle: text('libelle').notNull(),
    montantHt: numeric('montant_ht', { precision: 14, scale: 2 }).notNull(),
    portee: porteePosteInterne('portee').notNull(),
    chapitreLigneId: uuid('chapitre_ligne_id').references(() => lignesDevis.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_postes_internes_devis').on(t.devisId, t.ordre),
    check('chk_postes_internes_montant_pos', sql`montant_ht > 0`),
    check('chk_postes_internes_libelle', sql`length(trim(libelle)) > 0`),
    check(
      'chk_postes_internes_portee_chapitre',
      sql`(portee = 'devis' AND chapitre_ligne_id IS NULL)
         OR (portee = 'chapitre' AND chapitre_ligne_id IS NOT NULL)`,
    ),
  ],
);

export type PosteInterne = typeof postesInternesDevis.$inferSelect;
export type NouveauPosteInterne = typeof postesInternesDevis.$inferInsert;

export const repartitionsPosteInterne = pgTable(
  'repartitions_poste_interne',
  {
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    posteInterneId: uuid('poste_interne_id')
      .notNull()
      .references(() => postesInternesDevis.id, { onDelete: 'cascade' }),
    ligneDevisId: uuid('ligne_devis_id')
      .notNull()
      .references(() => lignesDevis.id, { onDelete: 'cascade' }),
    poids: numeric('poids', { precision: 10, scale: 4 }).notNull(),
  },
  (t) => [check('chk_repartitions_poids_nonneg', sql`poids >= 0`)],
);

export type RepartitionPosteInterne = typeof repartitionsPosteInterne.$inferSelect;
export type NouvelleRepartitionPosteInterne = typeof repartitionsPosteInterne.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Composants articles attachés à une ligne de devis
// ─────────────────────────────────────────────────────────────

export const composantsLigneDevis = pgTable(
  'composants_ligne_devis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    ligneDevisId: uuid('ligne_devis_id')
      .notNull()
      .references(() => lignesDevis.id, { onDelete: 'cascade' }),
    ordre: integer('ordre').notNull(),
    /** 'article_catalogue' → articleId requis, designation null.
     *  'libre' → designation requise, articleId null. */
    type: text('type').notNull().default('article_catalogue'),
    articleId: uuid('article_id').references(() => articles.id, {
      onDelete: 'restrict',
    }),
    designation: text('designation'),
    quantiteParUnite: numeric('quantite_par_unite', { precision: 14, scale: 4 }).notNull(),
    prixUnitaireHt: numeric('prix_unitaire_ht', { precision: 14, scale: 2 }).notNull(),
    /** Override TVA pour les composants libres (NULL = hérite de la ligne). */
    tauxTva: numeric('taux_tva', { precision: 5, scale: 2 }),
    /** Override remise % pour les composants libres (NULL = hérite de la ligne). */
    remisePourcent: numeric('remise_pourcent', { precision: 5, scale: 2 }),
    notes: text('notes'),
  },
  (t) => [
    index('idx_composants_ligne').on(t.ligneDevisId, t.ordre),
    check('chk_composants_qpu_pos', sql`quantite_par_unite > 0`),
    check('chk_composants_pu_nonneg', sql`prix_unitaire_ht >= 0`),
    check(
      'chk_composants_type_coherence',
      sql`(type = 'article_catalogue' AND article_id IS NOT NULL AND designation IS NULL)
          OR (type = 'libre' AND article_id IS NULL AND designation IS NOT NULL AND length(trim(designation)) > 0)`,
    ),
    check('chk_composants_tva_libre_only', sql`type = 'libre' OR taux_tva IS NULL`),
    check('chk_composants_remise_libre_only', sql`type = 'libre' OR remise_pourcent IS NULL`),
    check(
      'chk_composants_taux_tva_range',
      sql`taux_tva IS NULL OR (taux_tva >= 0 AND taux_tva <= 100)`,
    ),
    check(
      'chk_composants_remise_range',
      sql`remise_pourcent IS NULL OR (remise_pourcent >= 0 AND remise_pourcent <= 100)`,
    ),
  ],
);

export type ComposantLigneDevis = typeof composantsLigneDevis.$inferSelect;
export type NouveauComposantLigneDevis = typeof composantsLigneDevis.$inferInsert;
