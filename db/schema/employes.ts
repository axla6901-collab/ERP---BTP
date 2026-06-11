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
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { encryptedText } from '@/lib/crypto/encrypted-column';

import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

// ─────────────────────────────────────────────────────────────
// Enums M5.1 + M5.4
// ─────────────────────────────────────────────────────────────

export const typeContrat = pgEnum('type_contrat', ['CDI', 'CDD', 'INT', 'ALT', 'STAGE']);

export const zoneDeplacement = pgEnum('zone_deplacement', [
  'Z1',
  'Z2',
  'Z3',
  'Z4',
  'Z5',
  'GD',
  'GE',
]);

export const sexeEmploye = pgEnum('sexe_employe', ['M', 'F', 'NB']);

export const situationFamiliale = pgEnum('situation_familiale', [
  'celibataire',
  'marie',
  'pacse',
  'divorce',
  'veuf',
  'concubinage',
]);

export const classificationEmploye = pgEnum('classification_employe', [
  'ouvrier',
  'etam',
  'cadre',
  'apprenti',
]);

export const aptitudeMedicale = pgEnum('aptitude_medicale', [
  'apte',
  'apte_amenagement',
  'inapte_temporaire',
  'inapte',
]);

export const typeHabilitation = pgEnum('type_habilitation', [
  'caces_r482_a',
  'caces_r482_b',
  'caces_r482_c',
  'caces_r482_d',
  'caces_r482_e',
  'caces_r482_f',
  'caces_r482_g',
  'caces_r489_1a',
  'caces_r489_1b',
  'caces_r489_3',
  'caces_r489_5',
  'caces_r489_6',
  'aipr_concepteur',
  'aipr_encadrant',
  'aipr_operateur',
  'habilitation_b0',
  'habilitation_be_manoeuvre',
  'habilitation_b1v',
  'habilitation_b2v',
  'habilitation_br',
  'habilitation_bc',
  'habilitation_hf',
  'secouriste_sst',
  'autre',
]);

export const categoriePermis = pgEnum('categorie_permis', [
  'B',
  'BE',
  'C',
  'C1',
  'C1E',
  'CE',
  'D',
  'D1',
  'D1E',
  'DE',
]);

export const typeDocumentEmploye = pgEnum('type_document_employe', [
  'cv',
  'photo',
  'contrat',
  'attestation_pole_emploi',
  'attestation_employeur',
  'carte_identite',
  'passeport',
  'titre_sejour',
  'justificatif_domicile',
  'rib',
  'carte_vitale',
  'carte_btp',
  'diplome',
  'certificat_medical',
  'autre',
]);

// ─────────────────────────────────────────────────────────────
// Table employes (étendue M5.4)
// ─────────────────────────────────────────────────────────────

export const employes = pgTable(
  'employes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    nom: text('nom').notNull(),
    prenom: text('prenom').notNull(),
    typeContrat: typeContrat('type_contrat').notNull().default('CDI'),
    societeInterim: text('societe_interim'),
    qualification: text('qualification'),
    // Donnée de rémunération : chiffrée applicativement (bytea). Pas d'agrégation
    // SQL — `coutMainOeuvre` (lib/dashboard) calcule sur lignes déjà déchiffrées.
    tauxHoraireBrut: encryptedText('taux_horaire_brut'),
    heuresHebdoContractuelles: numeric('heures_hebdo_contractuelles', {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default('39'),
    zoneDeplacementDefaut: zoneDeplacement('zone_deplacement_defaut'),
    dateEntree: date('date_entree'),
    dateSortie: date('date_sortie'),
    email: text('email'),
    telephoneMobile: text('telephone_mobile'),
    telephoneFixe: text('telephone_fixe'),
    actif: boolean('actif').notNull().default(true),
    utilisateurId: text('utilisateur_id').references(() => utilisateurs.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),

    // Identité civile
    dateNaissance: date('date_naissance'),
    lieuNaissance: text('lieu_naissance'),
    nationalite: text('nationalite').notNull().default('Française'),
    // Donnée sensible (RGPD art. 9) : chiffrée applicativement (bytea).
    numeroSecu: encryptedText('numero_secu'),
    sexe: sexeEmploye('sexe'),

    // Adresse personnelle
    adresseLigne1: text('adresse_ligne1'),
    adresseLigne2: text('adresse_ligne2'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    pays: text('pays').notNull().default('France'),

    // Contact urgence
    contactUrgenceNom: text('contact_urgence_nom'),
    contactUrgenceTelephone: text('contact_urgence_telephone'),
    contactUrgenceRelation: text('contact_urgence_relation'),

    // Famille
    situationFamiliale: situationFamiliale('situation_familiale'),
    nombreEnfants: integer('nombre_enfants').notNull().default(0),

    // Contrat avancé
    matricule: text('matricule'),
    dateEmbauche: date('date_embauche'),
    dateFinContrat: date('date_fin_contrat'),
    coefficientHierarchique: text('coefficient_hierarchique'),
    classification: classificationEmploye('classification'),
    // Donnée de rémunération sensible : chiffrée applicativement (bytea).
    salaireMensuelBrut: encryptedText('salaire_mensuel_brut'),
    conventionCollective: text('convention_collective').default('Bâtiment'),

    // Banque — coordonnées personnelles chiffrées applicativement (bytea).
    iban: encryptedText('iban'),
    bic: encryptedText('bic'),

    // Médical
    dateDerniereVisiteMedicale: date('date_derniere_visite_medicale'),
    dateProchaineVisiteMedicale: date('date_prochaine_visite_medicale'),
    aptitude: aptitudeMedicale('aptitude'),

    // Carte BTP
    numeroCarteBtp: text('numero_carte_btp'),
    dateValiditeCarteBtp: date('date_validite_carte_btp'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_employes_actif').on(t.actif),
    index('idx_employes_type_contrat').on(t.typeContrat),
    check(
      'chk_employes_interim_societe',
      sql`type_contrat <> 'INT' OR societe_interim IS NOT NULL`,
    ),
    check(
      'chk_employes_dates',
      sql`date_sortie IS NULL OR date_entree IS NULL OR date_sortie >= date_entree`,
    ),
    check('chk_employes_email', sql`email IS NULL OR email ~ '@'`),
    // Les CHECK regex sur `numero_secu` et `iban` ont été retirés (migration 0067) :
    // ces colonnes sont désormais chiffrées (bytea), le motif ne s'applique plus.
    // Le format est validé en amont par Zod (lib/validation/rh.ts : optionalSecu / optionalIban).
    check('chk_employes_code_postal', sql`code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'`),
    check('chk_employes_nombre_enfants', sql`nombre_enfants >= 0 AND nombre_enfants <= 20`),
  ],
);

export type Employe = typeof employes.$inferSelect;
export type NouvelEmploye = typeof employes.$inferInsert;

// ─────────────────────────────────────────────────────────────
// employe_habilitations (M5.4)
// ─────────────────────────────────────────────────────────────

export const employeHabilitations = pgTable(
  'employe_habilitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'cascade' }),
    type: typeHabilitation('type').notNull(),
    dateObtention: date('date_obtention'),
    dateValidite: date('date_validite'),
    numero: text('numero'),
    organisme: text('organisme'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_employe_habilitations_employe').on(t.employeId),
    index('idx_employe_habilitations_validite').on(t.dateValidite),
    check(
      'chk_employe_habilitations_dates',
      sql`date_validite IS NULL OR date_obtention IS NULL OR date_validite >= date_obtention`,
    ),
  ],
);

export type EmployeHabilitation = typeof employeHabilitations.$inferSelect;

// ─────────────────────────────────────────────────────────────
// employe_permis (M5.4)
// ─────────────────────────────────────────────────────────────

export const employePermis = pgTable(
  'employe_permis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'cascade' }),
    categorie: categoriePermis('categorie').notNull(),
    dateObtention: date('date_obtention'),
    dateValidite: date('date_validite'),
    numeroPermis: text('numero_permis'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_employe_permis_validite').on(t.dateValidite),
    check(
      'chk_employe_permis_dates',
      sql`date_validite IS NULL OR date_obtention IS NULL OR date_validite >= date_obtention`,
    ),
  ],
);

export type EmployePermis = typeof employePermis.$inferSelect;

// ─────────────────────────────────────────────────────────────
// employe_documents (M5.4)
// ─────────────────────────────────────────────────────────────

export const employeDocuments = pgTable(
  'employe_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'cascade' }),
    type: typeDocumentEmploye('type').notNull(),
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
    index('idx_employe_documents_employe').on(t.employeId),
    index('idx_employe_documents_validite').on(t.dateValidite),
    check('chk_employe_documents_taille', sql`taille_bytes IS NULL OR taille_bytes > 0`),
  ],
);

export type EmployeDocument = typeof employeDocuments.$inferSelect;
