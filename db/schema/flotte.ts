import {
  bigint,
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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { encryptedText } from '@/lib/crypto/encrypted-column';

import { chantiers } from './chantiers';
import { employes } from './employes';
import { entreprises } from './entreprises';
import { fournisseurs } from './catalogue';
import { utilisateurs } from './utilisateurs';

/**
 * Module Flotte automobile (option commerciale `entreprises.flotte_automobile_active`).
 *
 * Racine `flotte_vehicules` + tables filles (échéances, affectations, entretiens,
 * sinistres, pleins, documents). Toutes scopées tenant (`entreprise_id`) avec RLS
 * `p_tenant` (cf. migration 0075). Les filles héritent l'`entreprise_id` du véhicule
 * parent via le trigger `trg_inherit_entreprise_id('flotte_vehicules','vehicule_id')`.
 *
 * Le statut des échéances (à jour / à renouveler / expiré) est calculé en applicatif
 * (`lib/flotte/echeances.ts`), pas en SQL — même approche que la conformité tiers.
 */

// ─────────────────────────────────────────────────────────────
// Enums (listes partagées UI ↔ DB ; libellés FR dans lib/validation/flotte.ts)
// ─────────────────────────────────────────────────────────────

export const flotteTypeVehicule = pgEnum('flotte_type_vehicule', [
  'vl', // véhicule léger
  'vu', // utilitaire
  'pl', // poids lourd
  'engin', // engin de chantier
  'remorque',
  'deux_roues',
]);

export const flotteCarburant = pgEnum('flotte_carburant', [
  'essence',
  'diesel',
  'gnv',
  'electrique',
  'hybride',
  'hybride_rechargeable',
  'e85',
  'hydrogene',
]);

export const flotteStatutVehicule = pgEnum('flotte_statut_vehicule', [
  'actif',
  'immobilise',
  'en_reparation',
  'vendu',
  'reforme',
  'vole_detruit',
]);

export const flotteModeDetention = pgEnum('flotte_mode_detention', [
  'propriete',
  'lld',
  'loa',
  'credit_bail',
  'location_courte',
]);

export const flotteTypeEcheance = pgEnum('flotte_type_echeance', [
  'controle_technique',
  'controle_technique_pollution',
  'assurance',
  'carte_grise',
  'vignette_critair',
  'taxe_essieu',
  'extincteur',
  'chronotachygraphe',
  'revision_constructeur',
  'franchise_km',
]);

export const flotteTypeEntretien = pgEnum('flotte_type_entretien', [
  'revision',
  'vidange',
  'pneumatiques',
  'freinage',
  'reparation',
  'carrosserie',
  'controle_technique',
  'geometrie',
  'climatisation',
  'autre',
]);

export const flotteStatutAffectation = pgEnum('flotte_statut_affectation', [
  'prevue',
  'en_cours',
  'terminee',
  'annulee',
]);

export const flotteResponsabiliteSinistre = pgEnum('flotte_responsabilite_sinistre', [
  'tort_total',
  'tort_partiel',
  'non_responsable',
  'indeterminee',
]);

export const flotteTypeDocument = pgEnum('flotte_type_document', [
  'carte_grise',
  'attestation_assurance',
  'pv_controle_technique',
  'facture_entretien',
  'constat_sinistre',
  'contrat_location',
  'certificat_cession',
  'photo',
  'autre',
]);

// ─────────────────────────────────────────────────────────────
// Table RACINE — véhicules
// ─────────────────────────────────────────────────────────────

export const flotteVehicules = pgTable(
  'flotte_vehicules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    immatriculation: text('immatriculation').notNull(),
    /** Code parc interne (auto via generate_numero('vehicule') si non saisi). */
    codeInterne: text('code_interne'),
    typeVehicule: flotteTypeVehicule('type_vehicule').notNull().default('vl'),
    marque: text('marque').notNull(),
    modele: text('modele').notNull(),
    version: text('version'),
    vin: text('vin'),
    carburant: flotteCarburant('carburant').notNull().default('diesel'),
    datePremiereImmat: date('date_premiere_immat'),
    puissanceFiscale: integer('puissance_fiscale'),
    /** Pastille Crit'Air 0 (vert/élec) à 5. */
    critair: integer('critair'),
    places: integer('places'),
    ptacKg: integer('ptac_kg'),
    couleur: text('couleur'),
    modeDetention: flotteModeDetention('mode_detention').notNull().default('propriete'),
    dateAcquisition: date('date_acquisition'),
    prixAcquisitionHt: numeric('prix_acquisition_ht', { precision: 14, scale: 2 }),
    valeurResiduelleHt: numeric('valeur_residuelle_ht', { precision: 14, scale: 2 }),
    loyerMensuelHt: numeric('loyer_mensuel_ht', { precision: 14, scale: 2 }),
    organismeFinancement: text('organisme_financement'),
    kilometrageActuel: integer('kilometrage_actuel').notNull().default(0),
    dateReleveKm: date('date_releve_km'),
    /** Conducteur habituel (raccourci de lecture ; l'historique d'affectations fait foi). */
    conducteurPrincipalId: uuid('conducteur_principal_id').references(() => employes.id, {
      onDelete: 'set null',
    }),
    statut: flotteStatutVehicule('statut').notNull().default('actif'),
    dateSortieParc: date('date_sortie_parc'),
    prixReventeHt: numeric('prix_revente_ht', { precision: 14, scale: 2 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_flotte_vehicules_immat_actif')
      .on(t.entrepriseId, t.immatriculation)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_flotte_vehicules_code_actif')
      .on(t.entrepriseId, t.codeInterne)
      .where(sql`code_interne IS NOT NULL AND deleted_at IS NULL`),
    index('idx_flotte_vehicules_entreprise').on(t.entrepriseId),
    index('idx_flotte_vehicules_statut')
      .on(t.statut)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_vehicules_conducteur').on(t.conducteurPrincipalId),
    check('chk_flotte_vehicules_km', sql`kilometrage_actuel >= 0`),
    check('chk_flotte_vehicules_critair', sql`critair IS NULL OR (critair >= 0 AND critair <= 5)`),
    check(
      'chk_flotte_vehicules_prix',
      sql`(prix_acquisition_ht IS NULL OR prix_acquisition_ht >= 0)
        AND (valeur_residuelle_ht IS NULL OR valeur_residuelle_ht >= 0)
        AND (loyer_mensuel_ht IS NULL OR loyer_mensuel_ht >= 0)
        AND (prix_revente_ht IS NULL OR prix_revente_ht >= 0)`,
    ),
    check(
      'chk_flotte_vehicules_sortie',
      sql`statut NOT IN ('vendu','reforme','vole_detruit') OR date_sortie_parc IS NOT NULL`,
    ),
  ],
);

export type FlotteVehicule = typeof flotteVehicules.$inferSelect;
export type NouveauFlotteVehicule = typeof flotteVehicules.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Échéances réglementaires (CT, assurance, carte grise, Crit'Air…)
// ─────────────────────────────────────────────────────────────

export const flotteEcheances = pgTable(
  'flotte_echeances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    vehiculeId: uuid('vehicule_id')
      .notNull()
      .references(() => flotteVehicules.id, { onDelete: 'cascade' }),
    typeEcheance: flotteTypeEcheance('type_echeance').notNull(),
    libelle: text('libelle'),
    dateDebutValidite: date('date_debut_validite'),
    dateEcheance: date('date_echeance').notNull(),
    /** Seuil d'alerte (rappel J-N), 30 jours par défaut. */
    seuilAlerteJours: integer('seuil_alerte_jours').notNull().default(30),
    reference: text('reference'),
    prestataire: text('prestataire'),
    montantHt: numeric('montant_ht', { precision: 14, scale: 2 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Une seule échéance courante par (véhicule, type) — renouvelée en place.
    uniqueIndex('uq_flotte_echeances_type_actif')
      .on(t.vehiculeId, t.typeEcheance)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_echeances_vehicule')
      .on(t.vehiculeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_echeances_echeance')
      .on(t.entrepriseId, t.dateEcheance)
      .where(sql`deleted_at IS NULL`),
    check('chk_flotte_echeances_seuil', sql`seuil_alerte_jours >= 0`),
    check(
      'chk_flotte_echeances_dates',
      sql`date_debut_validite IS NULL OR date_echeance >= date_debut_validite`,
    ),
    check('chk_flotte_echeances_montant', sql`montant_ht IS NULL OR montant_ht >= 0`),
  ],
);

export type FlotteEcheance = typeof flotteEcheances.$inferSelect;
export type NouvelleFlotteEcheance = typeof flotteEcheances.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Affectations (véhicule → conducteur ET/OU chantier, historique)
// ─────────────────────────────────────────────────────────────

export const flotteAffectations = pgTable(
  'flotte_affectations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    vehiculeId: uuid('vehicule_id')
      .notNull()
      .references(() => flotteVehicules.id, { onDelete: 'cascade' }),
    employeId: uuid('employe_id').references(() => employes.id, { onDelete: 'restrict' }),
    chantierId: uuid('chantier_id').references(() => chantiers.id, { onDelete: 'restrict' }),
    statut: flotteStatutAffectation('statut').notNull().default('en_cours'),
    dateDebut: date('date_debut').notNull(),
    dateFin: date('date_fin'),
    kmDebut: integer('km_debut'),
    kmFin: integer('km_fin'),
    motif: text('motif'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Une seule affectation « en cours » par véhicule.
    uniqueIndex('uq_flotte_affectations_en_cours')
      .on(t.vehiculeId)
      .where(sql`statut = 'en_cours' AND deleted_at IS NULL`),
    index('idx_flotte_affectations_vehicule')
      .on(t.vehiculeId, t.dateDebut)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_affectations_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_affectations_chantier')
      .on(t.chantierId)
      .where(sql`deleted_at IS NULL`),
    check('chk_flotte_affectations_cible', sql`employe_id IS NOT NULL OR chantier_id IS NOT NULL`),
    check('chk_flotte_affectations_dates', sql`date_fin IS NULL OR date_fin >= date_debut`),
    check(
      'chk_flotte_affectations_km',
      sql`km_fin IS NULL OR km_debut IS NULL OR km_fin >= km_debut`,
    ),
  ],
);

export type FlotteAffectation = typeof flotteAffectations.$inferSelect;
export type NouvelleFlotteAffectation = typeof flotteAffectations.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Entretiens / maintenance (Phase 2)
// ─────────────────────────────────────────────────────────────

export const flotteEntretiens = pgTable(
  'flotte_entretiens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    vehiculeId: uuid('vehicule_id')
      .notNull()
      .references(() => flotteVehicules.id, { onDelete: 'cascade' }),
    typeEntretien: flotteTypeEntretien('type_entretien').notNull().default('revision'),
    dateEntretien: date('date_entretien').notNull(),
    kilometrage: integer('kilometrage'),
    description: text('description').notNull(),
    prestataire: text('prestataire'),
    /** Garage référencé en tant que fournisseur (optionnel). */
    fournisseurId: uuid('fournisseur_id').references(() => fournisseurs.id, {
      onDelete: 'set null',
    }),
    coutHt: numeric('cout_ht', { precision: 14, scale: 2 }).notNull().default('0'),
    coutTva: numeric('cout_tva', { precision: 14, scale: 2 }),
    coutTtc: numeric('cout_ttc', { precision: 14, scale: 2 }),
    prochaineEcheanceKm: integer('prochaine_echeance_km'),
    prochaineEcheanceDate: date('prochaine_echeance_date'),
    garantie: boolean('garantie').notNull().default(false),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_flotte_entretiens_vehicule')
      .on(t.vehiculeId, t.dateEntretien)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_entretiens_fournisseur').on(t.fournisseurId),
    check('chk_flotte_entretiens_cout', sql`cout_ht >= 0`),
    check('chk_flotte_entretiens_km', sql`kilometrage IS NULL OR kilometrage >= 0`),
  ],
);

export type FlotteEntretien = typeof flotteEntretiens.$inferSelect;
export type NouvelFlotteEntretien = typeof flotteEntretiens.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Sinistres (Phase 3)
// ─────────────────────────────────────────────────────────────

export const flotteSinistres = pgTable(
  'flotte_sinistres',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    vehiculeId: uuid('vehicule_id')
      .notNull()
      .references(() => flotteVehicules.id, { onDelete: 'cascade' }),
    employeId: uuid('employe_id').references(() => employes.id, { onDelete: 'set null' }),
    numeroSinistre: text('numero_sinistre'),
    dateSinistre: date('date_sinistre').notNull(),
    lieu: text('lieu'),
    description: text('description'),
    responsabilite: flotteResponsabiliteSinistre('responsabilite')
      .notNull()
      .default('indeterminee'),
    tiersImplique: boolean('tiers_implique').notNull().default(false),
    montantDommagesHt: numeric('montant_dommages_ht', { precision: 14, scale: 2 }),
    franchiseHt: numeric('franchise_ht', { precision: 14, scale: 2 }),
    indemnisationHt: numeric('indemnisation_ht', { precision: 14, scale: 2 }),
    clos: boolean('clos').notNull().default(false),
    dateCloture: date('date_cloture'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_flotte_sinistres_vehicule')
      .on(t.vehiculeId, t.dateSinistre)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_sinistres_employe').on(t.employeId),
    check(
      'chk_flotte_sinistres_montants',
      sql`(montant_dommages_ht IS NULL OR montant_dommages_ht >= 0)
        AND (franchise_ht IS NULL OR franchise_ht >= 0)
        AND (indemnisation_ht IS NULL OR indemnisation_ht >= 0)`,
    ),
  ],
);

export type FlotteSinistre = typeof flotteSinistres.$inferSelect;
export type NouveauFlotteSinistre = typeof flotteSinistres.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Pleins de carburant / recharges (Phase 3)
// ─────────────────────────────────────────────────────────────

export const flottePleins = pgTable(
  'flotte_pleins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    vehiculeId: uuid('vehicule_id')
      .notNull()
      .references(() => flotteVehicules.id, { onDelete: 'cascade' }),
    employeId: uuid('employe_id').references(() => employes.id, { onDelete: 'set null' }),
    datePlein: date('date_plein').notNull(),
    kilometrage: integer('kilometrage').notNull(),
    volumeLitres: numeric('volume_litres', { precision: 8, scale: 2 }),
    energieKwh: numeric('energie_kwh', { precision: 8, scale: 2 }),
    prixHt: numeric('prix_ht', { precision: 10, scale: 2 }).notNull().default('0'),
    prixTtc: numeric('prix_ttc', { precision: 10, scale: 2 }),
    /** Plein « à ras » : requis pour un calcul de consommation fiable entre 2 pleins. */
    pleinComplet: boolean('plein_complet').notNull().default(true),
    station: text('station'),
    /** Donnée sensible → chiffrée applicativement (bytea AES-256-GCM). */
    numeroCarteCarburant: encryptedText('numero_carte_carburant'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_flotte_pleins_vehicule')
      .on(t.vehiculeId, t.kilometrage)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_pleins_date').on(t.entrepriseId, t.datePlein),
    check('chk_flotte_pleins_km', sql`kilometrage >= 0`),
    check('chk_flotte_pleins_prix', sql`prix_ht >= 0`),
    check('chk_flotte_pleins_volume', sql`volume_litres IS NULL OR volume_litres > 0`),
    check('chk_flotte_pleins_qte', sql`volume_litres IS NOT NULL OR energie_kwh IS NOT NULL`),
  ],
);

export type FlottePlein = typeof flottePleins.$inferSelect;
export type NouveauFlottePlein = typeof flottePleins.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Documents (GED véhicule — fichiers en MinIO, cf. lib/storage/s3.ts)
// ─────────────────────────────────────────────────────────────
//   Calqué sur `documents_tiers` : la table ne porte que les métadonnées +
//   la clé MinIO. Un document peut être rattaché optionnellement à une échéance,
//   un entretien ou un sinistre (FK ON DELETE SET NULL).

export const flotteDocuments = pgTable(
  'flotte_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    vehiculeId: uuid('vehicule_id')
      .notNull()
      .references(() => flotteVehicules.id, { onDelete: 'cascade' }),
    typeDocument: flotteTypeDocument('type_document').notNull().default('autre'),
    libelle: text('libelle').notNull(),
    minioKey: text('minio_key').notNull(),
    mimeType: text('mime_type').notNull(),
    tailleBytes: bigint('taille_bytes', { mode: 'number' }),
    dateValidite: date('date_validite'),
    notes: text('notes'),
    // Rattachement optionnel à un enregistrement précis.
    echeanceId: uuid('echeance_id').references(() => flotteEcheances.id, { onDelete: 'set null' }),
    entretienId: uuid('entretien_id').references(() => flotteEntretiens.id, {
      onDelete: 'set null',
    }),
    sinistreId: uuid('sinistre_id').references(() => flotteSinistres.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_flotte_documents_vehicule')
      .on(t.vehiculeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_flotte_documents_echeance').on(t.echeanceId),
    index('idx_flotte_documents_entretien').on(t.entretienId),
    index('idx_flotte_documents_sinistre').on(t.sinistreId),
    check('chk_flotte_documents_taille', sql`taille_bytes IS NULL OR taille_bytes > 0`),
  ],
);

export type FlotteDocument = typeof flotteDocuments.$inferSelect;
export type NouveauFlotteDocument = typeof flotteDocuments.$inferInsert;
