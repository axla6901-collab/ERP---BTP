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
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { encryptedText } from '@/lib/crypto/encrypted-column';

import { chantiers } from './chantiers';
import { classificationEmploye, employes } from './employes';
import { entreprises } from './entreprises';
import { societes } from './societes';
import { utilisateurs } from './utilisateurs';

/**
 * Module « Test SIRH » (option par entreprise `entreprises.test_sirh_active`).
 *
 * SIRH natif construit d'après le périmètre fonctionnel de l'API Factorial
 * (organisation, contrats, absences, temps, paie, frais, documents, recrutement,
 * performance, formation, onboarding, matériel, annonces) — sans dépendance au
 * SaaS. Les collaborateurs restent ceux de la table `employes` (module RH) :
 * le SIRH n'y ajoute que des données rattachées.
 *
 * Toutes les tables sont scopées tenant (`entreprise_id`, RLS `p_tenant`, migration
 * 0078). Les tables filles héritent l'`entreprise_id` de leur parent via
 * `trg_inherit_entreprise_id` (0044). Les statuts dérivés (solde de compteur,
 * contrat en cours, échéances de formation…) sont calculés en applicatif.
 */

// ─────────────────────────────────────────────────────────────
// Colonnes communes
// ─────────────────────────────────────────────────────────────

/** `entreprise_id` (tenant) — fonction pour obtenir un builder neuf par table. */
const colonneEntreprise = () =>
  uuid('entreprise_id')
    .notNull()
    .references(() => entreprises.id, { onDelete: 'restrict' });

/** Colonnes d'audit + soft-delete communes à toutes les tables du module. */
const colonnesAudit = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ─────────────────────────────────────────────────────────────
// Enums (libellés FR dans lib/validation/test-sirh/enums.ts)
// ─────────────────────────────────────────────────────────────

export const sirhTypeSite = pgEnum('sirh_type_site', [
  'siege',
  'agence',
  'depot',
  'atelier',
  'bureau_chantier',
  'autre',
]);

export const sirhTypeContrat = pgEnum('sirh_type_contrat', [
  'cdi',
  'cdd',
  'cdi_chantier',
  'interim',
  'apprentissage',
  'professionnalisation',
  'stage',
  'saisonnier',
  'autre',
]);

export const sirhTempsTravail = pgEnum('sirh_temps_travail', [
  'temps_plein',
  'temps_partiel',
  'forfait_jours',
]);

export const sirhMotifFinContrat = pgEnum('sirh_motif_fin_contrat', [
  'fin_cdd',
  'fin_chantier',
  'demission',
  'licenciement',
  'rupture_conventionnelle',
  'fin_periode_essai',
  'retraite',
  'deces',
  'mutation',
  'autre',
]);

export const sirhStatutPeriodePaie = pgEnum('sirh_statut_periode_paie', [
  'ouverte',
  'en_controle',
  'cloturee',
]);

export const sirhTypeVariablePaie = pgEnum('sirh_type_variable_paie', [
  'prime',
  'heures_supplementaires',
  'indemnite',
  'avance',
  'acompte',
  'retenue',
  'avantage_nature',
  'remboursement_frais',
  'absence',
  'autre',
]);

export const sirhSourceVariable = pgEnum('sirh_source_variable', [
  'manuelle',
  'absence',
  'heures_sup',
  'note_frais',
]);

export const sirhCategorieAbsence = pgEnum('sirh_categorie_absence', [
  'conges',
  'maladie',
  'familial',
  'formation',
  'sans_solde',
  'intemperies',
  'autre',
]);

export const sirhUniteDecompte = pgEnum('sirh_unite_decompte', [
  'jours_ouvrables',
  'jours_ouvres',
  'jours_calendaires',
  'heures',
]);

export const sirhStatutDemande = pgEnum('sirh_statut_demande', [
  'brouillon',
  'en_attente',
  'approuvee',
  'refusee',
  'annulee',
]);

export const sirhLieuTravail = pgEnum('sirh_lieu_travail', [
  'chantier',
  'atelier',
  'bureau',
  'teletravail',
  'deplacement',
]);

export const sirhSourceBadgeage = pgEnum('sirh_source_badgeage', [
  'manuel',
  'mobile',
  'badgeuse',
  'import',
]);

export const sirhCompensationHs = pgEnum('sirh_compensation_hs', ['paiement', 'recuperation']);

export const sirhNatureFrais = pgEnum('sirh_nature_frais', ['depense', 'indemnite_km', 'forfait']);

export const sirhCategorieFrais = pgEnum('sirh_categorie_frais', [
  'repas',
  'hebergement',
  'transport',
  'carburant',
  'peage_parking',
  'fournitures',
  'telephone',
  'panier',
  'grand_deplacement',
  'autre',
]);

export const sirhStatutFrais = pgEnum('sirh_statut_frais', [
  'brouillon',
  'soumise',
  'approuvee',
  'refusee',
  'remboursee',
]);

export const sirhStatutOffre = pgEnum('sirh_statut_offre', [
  'brouillon',
  'publiee',
  'suspendue',
  'pourvue',
  'fermee',
]);

export const sirhSourceCandidat = pgEnum('sirh_source_candidat', [
  'candidature_spontanee',
  'site_carriere',
  'france_travail',
  'job_board',
  'reseaux_sociaux',
  'cooptation',
  'ecole',
  'interim',
  'autre',
]);

export const sirhEtapeCandidature = pgEnum('sirh_etape_candidature', [
  'nouvelle',
  'preselection',
  'entretien_rh',
  'entretien_technique',
  'proposition',
  'embauche',
  'refusee',
  'desistement',
]);

export const sirhMotifRefus = pgEnum('sirh_motif_refus', [
  'profil_inadequat',
  'experience_insuffisante',
  'pretentions_salariales',
  'poste_pourvu',
  'desistement_candidat',
  'autre',
]);

export const sirhAvisRecrutement = pgEnum('sirh_avis_recrutement', [
  'favorable',
  'reserve',
  'defavorable',
]);

export const sirhTypeEntretien = pgEnum('sirh_type_entretien', [
  'annuel',
  'professionnel',
  'fin_periode_essai',
  'mi_annee',
  'bilan_6_ans',
  'autre',
]);

export const sirhStatutCampagne = pgEnum('sirh_statut_campagne', [
  'brouillon',
  'en_cours',
  'cloturee',
]);

export const sirhStatutEntretien = pgEnum('sirh_statut_entretien', [
  'a_planifier',
  'planifie',
  'realise',
  'signe',
  'annule',
]);

export const sirhStatutObjectif = pgEnum('sirh_statut_objectif', [
  'en_cours',
  'atteint',
  'partiellement_atteint',
  'non_atteint',
  'abandonne',
]);

export const sirhCategorieFormation = pgEnum('sirh_categorie_formation', [
  'securite',
  'technique',
  'reglementaire',
  'management',
  'bureautique',
  'langues',
  'autre',
]);

export const sirhModaliteFormation = pgEnum('sirh_modalite_formation', [
  'presentiel',
  'distanciel',
  'mixte',
  'interne',
]);

export const sirhStatutSession = pgEnum('sirh_statut_session', [
  'planifiee',
  'confirmee',
  'realisee',
  'annulee',
]);

export const sirhStatutInscription = pgEnum('sirh_statut_inscription', [
  'inscrit',
  'present',
  'absent',
  'annule',
]);

export const sirhResultatFormation = pgEnum('sirh_resultat_formation', [
  'non_evalue',
  'reussi',
  'echoue',
]);

export const sirhTypeProcessus = pgEnum('sirh_type_processus', [
  'onboarding',
  'offboarding',
  'mobilite',
  'autre',
]);

export const sirhResponsableTache = pgEnum('sirh_responsable_tache', [
  'rh',
  'manager',
  'salarie',
  'it',
  'autre',
]);

export const sirhStatutProcessus = pgEnum('sirh_statut_processus', [
  'en_cours',
  'termine',
  'annule',
]);

export const sirhStatutTache = pgEnum('sirh_statut_tache', [
  'a_faire',
  'en_cours',
  'faite',
  'annulee',
]);

export const sirhCategorieMateriel = pgEnum('sirh_categorie_materiel', [
  'informatique',
  'telephonie',
  'epi',
  'outillage',
  'badge_cle',
  'vetement',
  'autre',
]);

export const sirhStatutMateriel = pgEnum('sirh_statut_materiel', [
  'en_stock',
  'attribue',
  'en_reparation',
  'perdu',
  'reforme',
]);

export const sirhCategorieAnnonce = pgEnum('sirh_categorie_annonce', [
  'information',
  'securite',
  'evenement',
  'rh',
  'autre',
]);

// ─────────────────────────────────────────────────────────────
// Organisation
// ─────────────────────────────────────────────────────────────

/** Lieux de travail (Factorial locations/Location). */
export const sirhSites = pgTable(
  'sirh_sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    code: text('code'),
    nom: text('nom').notNull(),
    typeSite: sirhTypeSite('type_site').notNull().default('agence'),
    adresseLigne1: text('adresse_ligne1'),
    adresseLigne2: text('adresse_ligne2'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    pays: text('pays').notNull().default('France'),
    telephone: text('telephone'),
    actif: boolean('actif').notNull().default(true),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_sites_nom_actif')
      .on(t.entrepriseId, t.nom)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_sirh_sites_code_actif')
      .on(t.entrepriseId, t.code)
      .where(sql`code IS NOT NULL AND deleted_at IS NULL`),
    check('chk_sirh_sites_code_postal', sql`code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'`),
  ],
);
export type SirhSite = typeof sirhSites.$inferSelect;

/** Catalogue des postes (Factorial job_catalog Role + Level). */
export const sirhPostes = pgTable(
  'sirh_postes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    code: text('code'),
    intitule: text('intitule').notNull(),
    /** Famille métier libre (Gros œuvre, Second œuvre, Encadrement, Administratif…). */
    famille: text('famille'),
    categorie: classificationEmploye('categorie'),
    niveau: text('niveau'),
    coefficient: text('coefficient'),
    description: text('description'),
    actif: boolean('actif').notNull().default(true),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_postes_code_actif')
      .on(t.entrepriseId, t.code)
      .where(sql`code IS NOT NULL AND deleted_at IS NULL`),
    index('idx_sirh_postes_entreprise')
      .on(t.entrepriseId)
      .where(sql`deleted_at IS NULL`),
  ],
);
export type SirhPoste = typeof sirhPostes.$inferSelect;

/** Horaires de travail hebdomadaires (Factorial work_schedule Schedule + DayConfiguration). */
export const sirhHoraires = pgTable(
  'sirh_horaires',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    nom: text('nom').notNull(),
    description: text('description'),
    heuresLundi: numeric('heures_lundi', { precision: 4, scale: 2 }).notNull().default('7'),
    heuresMardi: numeric('heures_mardi', { precision: 4, scale: 2 }).notNull().default('7'),
    heuresMercredi: numeric('heures_mercredi', { precision: 4, scale: 2 }).notNull().default('7'),
    heuresJeudi: numeric('heures_jeudi', { precision: 4, scale: 2 }).notNull().default('7'),
    heuresVendredi: numeric('heures_vendredi', { precision: 4, scale: 2 }).notNull().default('7'),
    heuresSamedi: numeric('heures_samedi', { precision: 4, scale: 2 }).notNull().default('0'),
    heuresDimanche: numeric('heures_dimanche', { precision: 4, scale: 2 }).notNull().default('0'),
    parDefaut: boolean('par_defaut').notNull().default(false),
    actif: boolean('actif').notNull().default(true),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_horaires_nom_actif')
      .on(t.entrepriseId, t.nom)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_sirh_horaires_defaut')
      .on(t.entrepriseId)
      .where(sql`par_defaut AND deleted_at IS NULL`),
  ],
);
export type SirhHoraire = typeof sirhHoraires.$inferSelect;

/** Équipes (Factorial teams/Team). */
export const sirhEquipes = pgTable(
  'sirh_equipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    nom: text('nom').notNull(),
    description: text('description'),
    responsableId: uuid('responsable_id').references(() => employes.id, { onDelete: 'set null' }),
    siteId: uuid('site_id').references(() => sirhSites.id, { onDelete: 'set null' }),
    couleur: text('couleur').notNull().default('#f59e0b'),
    actif: boolean('actif').notNull().default(true),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_equipes_nom_actif')
      .on(t.entrepriseId, t.nom)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_equipes_responsable').on(t.responsableId),
    index('idx_sirh_equipes_site').on(t.siteId),
    check('chk_sirh_equipes_couleur', sql`couleur ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);
export type SirhEquipe = typeof sirhEquipes.$inferSelect;

/** Membres d'équipe (Factorial teams/Membership). */
export const sirhEquipeMembres = pgTable(
  'sirh_equipe_membres',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    equipeId: uuid('equipe_id')
      .notNull()
      .references(() => sirhEquipes.id, { onDelete: 'cascade' }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    estResponsable: boolean('est_responsable').notNull().default(false),
    dateDebut: date('date_debut'),
    dateFin: date('date_fin'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_equipe_membres_actif')
      .on(t.equipeId, t.employeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_equipe_membres_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    check(
      'chk_sirh_equipe_membres_dates',
      sql`date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut`,
    ),
  ],
);
export type SirhEquipeMembre = typeof sirhEquipeMembres.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Collaborateurs & contrats
// ─────────────────────────────────────────────────────────────

/** Extension SIRH 1-1 d'un employé (manager, lieu, poste, horaire, société employeuse). */
export const sirhCollaborateurs = pgTable(
  'sirh_collaborateurs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    posteId: uuid('poste_id').references(() => sirhPostes.id, { onDelete: 'set null' }),
    siteId: uuid('site_id').references(() => sirhSites.id, { onDelete: 'set null' }),
    managerId: uuid('manager_id').references(() => employes.id, { onDelete: 'set null' }),
    horaireId: uuid('horaire_id').references(() => sirhHoraires.id, { onDelete: 'set null' }),
    societeId: uuid('societe_id').references(() => societes.id, { onDelete: 'set null' }),
    emailProfessionnel: text('email_professionnel'),
    telephoneProfessionnel: text('telephone_professionnel'),
    dateAnciennete: date('date_anciennete'),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_collaborateurs_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_collaborateurs_manager').on(t.managerId),
    index('idx_sirh_collaborateurs_site').on(t.siteId),
    index('idx_sirh_collaborateurs_poste').on(t.posteId),
    check('chk_sirh_collaborateurs_manager', sql`manager_id IS NULL OR manager_id <> employe_id`),
    check(
      'chk_sirh_collaborateurs_email',
      sql`email_professionnel IS NULL OR email_professionnel ~ '@'`,
    ),
  ],
);
export type SirhCollaborateur = typeof sirhCollaborateurs.$inferSelect;

/** Versions de contrat (Factorial contracts/ContractVersion + Compensation). */
export const sirhContrats = pgTable(
  'sirh_contrats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    typeContrat: sirhTypeContrat('type_contrat').notNull().default('cdi'),
    /** Motif de recours (CDD, intérim) — obligatoire légalement pour un CDD. */
    motifRecours: text('motif_recours'),
    dateDebut: date('date_debut').notNull(),
    dateFin: date('date_fin'),
    dateFinPeriodeEssai: date('date_fin_periode_essai'),
    motifFin: sirhMotifFinContrat('motif_fin'),
    posteId: uuid('poste_id').references(() => sirhPostes.id, { onDelete: 'set null' }),
    /** Intitulé figé à la signature (le catalogue de postes peut évoluer). */
    intitulePoste: text('intitule_poste'),
    categorie: classificationEmploye('categorie'),
    niveau: text('niveau'),
    coefficient: text('coefficient'),
    tempsTravail: sirhTempsTravail('temps_travail').notNull().default('temps_plein'),
    heuresHebdo: numeric('heures_hebdo', { precision: 5, scale: 2 }),
    joursForfait: integer('jours_forfait'),
    // Rémunération : chiffrée applicativement (bytea). Jamais d'agrégat SQL dessus.
    salaireBrutMensuel: encryptedText('salaire_brut_mensuel'),
    tauxHoraireBrut: encryptedText('taux_horaire_brut'),
    conventionCollective: text('convention_collective').default('BTP'),
    societeId: uuid('societe_id').references(() => societes.id, { onDelete: 'set null' }),
    siteId: uuid('site_id').references(() => sirhSites.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_contrats_employe')
      .on(t.employeId, t.dateDebut)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_contrats_fin')
      .on(t.entrepriseId, t.dateFin)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_contrats_dates', sql`date_fin IS NULL OR date_fin >= date_debut`),
    check(
      'chk_sirh_contrats_essai',
      sql`date_fin_periode_essai IS NULL OR date_fin_periode_essai >= date_debut`,
    ),
    check(
      'chk_sirh_contrats_heures',
      sql`heures_hebdo IS NULL OR (heures_hebdo > 0 AND heures_hebdo <= 48)`,
    ),
    check(
      'chk_sirh_contrats_forfait',
      sql`jours_forfait IS NULL OR (jours_forfait > 0 AND jours_forfait <= 235)`,
    ),
    check('chk_sirh_contrats_motif_fin', sql`motif_fin IS NULL OR date_fin IS NOT NULL`),
  ],
);
export type SirhContrat = typeof sirhContrats.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Paie
// ─────────────────────────────────────────────────────────────

/** Périodes de paie mensuelles (Factorial payroll/PolicyPeriod). */
export const sirhPeriodesPaie = pgTable(
  'sirh_periodes_paie',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    annee: integer('annee').notNull(),
    mois: integer('mois').notNull(),
    statut: sirhStatutPeriodePaie('statut').notNull().default('ouverte'),
    dateCloture: timestamp('date_cloture', { withTimezone: true }),
    cloturePar: text('cloture_par').references(() => utilisateurs.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_periodes_paie_mois')
      .on(t.entrepriseId, t.annee, t.mois)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_periodes_paie_mois', sql`mois BETWEEN 1 AND 12`),
    check('chk_sirh_periodes_paie_annee', sql`annee BETWEEN 2000 AND 2100`),
  ],
);
export type SirhPeriodePaie = typeof sirhPeriodesPaie.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Documents & candidats (créés tôt : référencés par absences / frais)
// ─────────────────────────────────────────────────────────────

/** Dossiers de la GED RH (Factorial documents/Folder). */
export const sirhDossiersDocuments = pgTable(
  'sirh_dossiers_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    nom: text('nom').notNull(),
    description: text('description'),
    /** Les documents du dossier sont visibles par le salarié concerné (« Mon espace »). */
    visibleSalarie: boolean('visible_salarie').notNull().default(false),
    ordre: integer('ordre').notNull().default(0),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_dossiers_documents_nom_actif')
      .on(t.entrepriseId, t.nom)
      .where(sql`deleted_at IS NULL`),
  ],
);
export type SirhDossierDocuments = typeof sirhDossiersDocuments.$inferSelect;

/** Candidats (Factorial ats/Candidate). */
export const sirhCandidats = pgTable(
  'sirh_candidats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    nom: text('nom').notNull(),
    prenom: text('prenom').notNull(),
    email: text('email'),
    telephone: text('telephone'),
    ville: text('ville'),
    source: sirhSourceCandidat('source').notNull().default('candidature_spontanee'),
    consentementRgpd: boolean('consentement_rgpd').notNull().default(false),
    dateConsentement: date('date_consentement'),
    /** Employé créé à l'embauche (passerelle recrutement → RH). */
    employeId: uuid('employe_id').references(() => employes.id, { onDelete: 'set null' }),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_candidats_nom')
      .on(t.entrepriseId, t.nom, t.prenom)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_sirh_candidats_email_actif')
      .on(t.entrepriseId, sql`lower(${t.email})`)
      .where(sql`email IS NOT NULL AND deleted_at IS NULL`),
    check('chk_sirh_candidats_email', sql`email IS NULL OR email ~ '@'`),
  ],
);
export type SirhCandidat = typeof sirhCandidats.$inferSelect;

/**
 * Documents RH (Factorial documents/Document) — fichiers en MinIO.
 * `employeId` NULL = document d'entreprise ; `candidatId` = pièce de candidature.
 */
export const sirhDocuments = pgTable(
  'sirh_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    dossierId: uuid('dossier_id').references(() => sirhDossiersDocuments.id, {
      onDelete: 'set null',
    }),
    employeId: uuid('employe_id').references(() => employes.id, { onDelete: 'restrict' }),
    candidatId: uuid('candidat_id').references(() => sirhCandidats.id, { onDelete: 'cascade' }),
    titre: text('titre').notNull(),
    minioKey: text('minio_key').notNull(),
    mimeType: text('mime_type').notNull(),
    tailleBytes: bigint('taille_bytes', { mode: 'number' }),
    dateDocument: date('date_document'),
    dateExpiration: date('date_expiration'),
    visibleSalarie: boolean('visible_salarie').notNull().default(false),
    signatureRequise: boolean('signature_requise').notNull().default(false),
    signeLe: timestamp('signe_le', { withTimezone: true }),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_documents_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_documents_dossier')
      .on(t.dossierId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_documents_candidat').on(t.candidatId),
    index('idx_sirh_documents_expiration')
      .on(t.entrepriseId, t.dateExpiration)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_documents_taille', sql`taille_bytes IS NULL OR taille_bytes > 0`),
  ],
);
export type SirhDocument = typeof sirhDocuments.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Temps & absences
// ─────────────────────────────────────────────────────────────

/** Types d'absence (Factorial timeoff/LeaveType + Policy simplifiée). */
export const sirhTypesAbsence = pgTable(
  'sirh_types_absence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    code: text('code').notNull(),
    libelle: text('libelle').notNull(),
    categorie: sirhCategorieAbsence('categorie').notNull().default('conges'),
    uniteDecompte: sirhUniteDecompte('unite_decompte').notNull().default('jours_ouvres'),
    /** Décompté d'un compteur de droits (CP, RTT…). */
    avecSolde: boolean('avec_solde').notNull().default(false),
    necessiteValidation: boolean('necessite_validation').notNull().default(true),
    justificatifRequis: boolean('justificatif_requis').notNull().default(false),
    remuneree: boolean('remuneree').notNull().default(true),
    couleur: text('couleur').notNull().default('#f59e0b'),
    codeRubriquePaie: text('code_rubrique_paie'),
    actif: boolean('actif').notNull().default(true),
    ordre: integer('ordre').notNull().default(0),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_types_absence_code_actif')
      .on(t.entrepriseId, t.code)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_types_absence_couleur', sql`couleur ~ '^#[0-9a-fA-F]{6}$'`),
  ],
);
export type SirhTypeAbsence = typeof sirhTypesAbsence.$inferSelect;

/**
 * Compteurs de droits (Factorial timeoff/Allowance). Solde calculé en applicatif :
 * droits + report + Σ ajustements − Σ absences approuvées du type sur la période.
 */
export const sirhCompteurs = pgTable(
  'sirh_compteurs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    typeAbsenceId: uuid('type_absence_id')
      .notNull()
      .references(() => sirhTypesAbsence.id, { onDelete: 'restrict' }),
    periodeDebut: date('periode_debut').notNull(),
    periodeFin: date('periode_fin').notNull(),
    droitsAcquis: numeric('droits_acquis', { precision: 6, scale: 2 }).notNull().default('0'),
    report: numeric('report', { precision: 6, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_compteurs_periode')
      .on(t.employeId, t.typeAbsenceId, t.periodeDebut)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_compteurs_type').on(t.typeAbsenceId),
    check('chk_sirh_compteurs_periode', sql`periode_fin >= periode_debut`),
    check('chk_sirh_compteurs_droits', sql`droits_acquis >= 0`),
  ],
);
export type SirhCompteur = typeof sirhCompteurs.$inferSelect;

/** Ajustements manuels de compteur (Factorial timeoff/AllowanceIncidence). */
export const sirhCompteurAjustements = pgTable(
  'sirh_compteur_ajustements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    compteurId: uuid('compteur_id')
      .notNull()
      .references(() => sirhCompteurs.id, { onDelete: 'cascade' }),
    dateAjustement: date('date_ajustement').notNull(),
    /** Valeur signée (+ crédit / − débit), en unité du type d'absence. */
    valeur: numeric('valeur', { precision: 6, scale: 2 }).notNull(),
    motif: text('motif').notNull(),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_compteur_ajustements_compteur')
      .on(t.compteurId)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_compteur_ajustements_valeur', sql`valeur <> 0`),
  ],
);
export type SirhCompteurAjustement = typeof sirhCompteurAjustements.$inferSelect;

/** Demandes d'absence (Factorial timeoff/Leave) avec workflow de validation. */
export const sirhAbsences = pgTable(
  'sirh_absences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    typeAbsenceId: uuid('type_absence_id')
      .notNull()
      .references(() => sirhTypesAbsence.id, { onDelete: 'restrict' }),
    dateDebut: date('date_debut').notNull(),
    dateFin: date('date_fin').notNull(),
    /** `true` = l'absence commence l'après-midi de `dateDebut`. */
    demiJourneeDebut: boolean('demi_journee_debut').notNull().default(false),
    /** `true` = l'absence se termine à midi le jour de `dateFin`. */
    demiJourneeFin: boolean('demi_journee_fin').notNull().default(false),
    /** Durée décomptée (jours ou heures selon l'unité du type), figée à l'enregistrement. */
    duree: numeric('duree', { precision: 6, scale: 2 }).notNull().default('0'),
    motif: text('motif'),
    statut: sirhStatutDemande('statut').notNull().default('en_attente'),
    demandePar: text('demande_par').references(() => utilisateurs.id, { onDelete: 'set null' }),
    valideurId: text('valideur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
    dateDecision: timestamp('date_decision', { withTimezone: true }),
    commentaireDecision: text('commentaire_decision'),
    justificatifDocumentId: uuid('justificatif_document_id').references(() => sirhDocuments.id, {
      onDelete: 'set null',
    }),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_absences_employe')
      .on(t.employeId, t.dateDebut)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_absences_periode')
      .on(t.entrepriseId, t.dateDebut, t.dateFin)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_absences_statut')
      .on(t.entrepriseId, t.statut)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_absences_type').on(t.typeAbsenceId),
    check('chk_sirh_absences_dates', sql`date_fin >= date_debut`),
    check('chk_sirh_absences_duree', sql`duree >= 0`),
    check(
      'chk_sirh_absences_demi_journee',
      sql`date_fin > date_debut OR NOT (demi_journee_debut AND demi_journee_fin)`,
    ),
  ],
);
export type SirhAbsence = typeof sirhAbsences.$inferSelect;

/** Périodes bloquées pour les congés (Factorial timeoff/BlockedPeriod). */
export const sirhPeriodesBloquees = pgTable(
  'sirh_periodes_bloquees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    libelle: text('libelle').notNull(),
    dateDebut: date('date_debut').notNull(),
    dateFin: date('date_fin').notNull(),
    /** NULL = tous les types d'absence. */
    typeAbsenceId: uuid('type_absence_id').references(() => sirhTypesAbsence.id, {
      onDelete: 'cascade',
    }),
    /** NULL = toutes les équipes. */
    equipeId: uuid('equipe_id').references(() => sirhEquipes.id, { onDelete: 'cascade' }),
    motif: text('motif'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_periodes_bloquees_dates')
      .on(t.entrepriseId, t.dateDebut, t.dateFin)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_periodes_bloquees_dates', sql`date_fin >= date_debut`),
  ],
);
export type SirhPeriodeBloquee = typeof sirhPeriodesBloquees.$inferSelect;

/** Jours fériés (Factorial holidays/CompanyHoliday). `siteId` NULL = tous les sites. */
export const sirhJoursFeries = pgTable(
  'sirh_jours_feries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    dateFerie: date('date_ferie').notNull(),
    libelle: text('libelle').notNull(),
    siteId: uuid('site_id').references(() => sirhSites.id, { onDelete: 'cascade' }),
    /** Jour non travaillé (un férié peut être travaillé, ex. lundi de Pentecôte = journée de solidarité). */
    chome: boolean('chome').notNull().default(true),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_jours_feries_global')
      .on(t.entrepriseId, t.dateFerie)
      .where(sql`site_id IS NULL AND deleted_at IS NULL`),
    uniqueIndex('uq_sirh_jours_feries_site')
      .on(t.entrepriseId, t.dateFerie, t.siteId)
      .where(sql`site_id IS NOT NULL AND deleted_at IS NULL`),
  ],
);
export type SirhJourFerie = typeof sirhJoursFeries.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Temps de travail
// ─────────────────────────────────────────────────────────────

/**
 * Badgeages / pointages de présence (Factorial attendance/Shift).
 * `heureFin < heureDebut` = poste de nuit franchissant minuit ; `heureFin` NULL = en cours.
 */
export const sirhBadgeages = pgTable(
  'sirh_badgeages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    dateBadgeage: date('date_badgeage').notNull(),
    heureDebut: time('heure_debut').notNull(),
    heureFin: time('heure_fin'),
    pauseMinutes: integer('pause_minutes').notNull().default(0),
    lieu: sirhLieuTravail('lieu').notNull().default('chantier'),
    chantierId: uuid('chantier_id').references(() => chantiers.id, { onDelete: 'set null' }),
    source: sirhSourceBadgeage('source').notNull().default('manuel'),
    valide: boolean('valide').notNull().default(false),
    validePar: text('valide_par').references(() => utilisateurs.id, { onDelete: 'set null' }),
    valideLe: timestamp('valide_le', { withTimezone: true }),
    commentaire: text('commentaire'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_badgeages_employe')
      .on(t.employeId, t.dateBadgeage)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_badgeages_date')
      .on(t.entrepriseId, t.dateBadgeage)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_badgeages_chantier').on(t.chantierId),
    check('chk_sirh_badgeages_pause', sql`pause_minutes BETWEEN 0 AND 720`),
  ],
);
export type SirhBadgeage = typeof sirhBadgeages.$inferSelect;

/** Demandes d'heures supplémentaires (Factorial attendance/OvertimeRequest). */
export const sirhHeuresSup = pgTable(
  'sirh_heures_sup',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    dateHeures: date('date_heures').notNull(),
    dureeHeures: numeric('duree_heures', { precision: 5, scale: 2 }).notNull(),
    /** Taux de majoration (0, 10, 25, 50 ou 100 %). */
    majorationPct: integer('majoration_pct').notNull().default(25),
    compensation: sirhCompensationHs('compensation').notNull().default('paiement'),
    motif: text('motif'),
    chantierId: uuid('chantier_id').references(() => chantiers.id, { onDelete: 'set null' }),
    statut: sirhStatutDemande('statut').notNull().default('en_attente'),
    demandePar: text('demande_par').references(() => utilisateurs.id, { onDelete: 'set null' }),
    valideurId: text('valideur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
    dateDecision: timestamp('date_decision', { withTimezone: true }),
    commentaireDecision: text('commentaire_decision'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_heures_sup_employe')
      .on(t.employeId, t.dateHeures)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_heures_sup_statut')
      .on(t.entrepriseId, t.statut)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_heures_sup_duree', sql`duree_heures > 0 AND duree_heures <= 24`),
    check('chk_sirh_heures_sup_majoration', sql`majoration_pct IN (0, 10, 25, 50, 100)`),
  ],
);
export type SirhHeuresSup = typeof sirhHeuresSup.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Notes de frais (Factorial expenses : Expense / Mileage / PerDiem)
// ─────────────────────────────────────────────────────────────

export const sirhNotesFrais = pgTable(
  'sirh_notes_frais',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    dateDepense: date('date_depense').notNull(),
    nature: sirhNatureFrais('nature').notNull().default('depense'),
    categorie: sirhCategorieFrais('categorie').notNull().default('autre'),
    libelle: text('libelle').notNull(),
    montantTtc: numeric('montant_ttc', { precision: 12, scale: 2 }).notNull().default('0'),
    montantTva: numeric('montant_tva', { precision: 12, scale: 2 }),
    // Indemnités kilométriques
    distanceKm: numeric('distance_km', { precision: 8, scale: 1 }),
    puissanceFiscale: integer('puissance_fiscale'),
    tauxKm: numeric('taux_km', { precision: 6, scale: 3 }),
    // Forfaits (panier, grand déplacement…)
    nbForfaits: numeric('nb_forfaits', { precision: 5, scale: 1 }),
    montantUnitaire: numeric('montant_unitaire', { precision: 10, scale: 2 }),
    /** Imputation analytique chantier (spécificité BTP). */
    chantierId: uuid('chantier_id').references(() => chantiers.id, { onDelete: 'set null' }),
    justificatifDocumentId: uuid('justificatif_document_id').references(() => sirhDocuments.id, {
      onDelete: 'set null',
    }),
    statut: sirhStatutFrais('statut').notNull().default('soumise'),
    demandePar: text('demande_par').references(() => utilisateurs.id, { onDelete: 'set null' }),
    valideurId: text('valideur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
    dateDecision: timestamp('date_decision', { withTimezone: true }),
    commentaireDecision: text('commentaire_decision'),
    dateRemboursement: date('date_remboursement'),
    periodePaieId: uuid('periode_paie_id').references(() => sirhPeriodesPaie.id, {
      onDelete: 'set null',
    }),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_notes_frais_employe')
      .on(t.employeId, t.dateDepense)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_notes_frais_statut')
      .on(t.entrepriseId, t.statut)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_notes_frais_chantier').on(t.chantierId),
    check(
      'chk_sirh_notes_frais_montants',
      sql`montant_ttc >= 0 AND (montant_tva IS NULL OR (montant_tva >= 0 AND montant_tva <= montant_ttc))`,
    ),
    check(
      'chk_sirh_notes_frais_km',
      sql`nature <> 'indemnite_km' OR (distance_km IS NOT NULL AND distance_km > 0)`,
    ),
    check(
      'chk_sirh_notes_frais_forfait',
      sql`nature <> 'forfait' OR (nb_forfaits IS NOT NULL AND nb_forfaits > 0)`,
    ),
    check(
      'chk_sirh_notes_frais_cv',
      sql`puissance_fiscale IS NULL OR (puissance_fiscale BETWEEN 1 AND 50)`,
    ),
  ],
);
export type SirhNoteFrais = typeof sirhNotesFrais.$inferSelect;

/**
 * Variables de paie (Factorial payroll/Supplement) — saisies ou générées depuis les
 * absences / heures sup / notes de frais validées (`source` + `sourceId`, unicité
 * par période pour éviter les doubles imports).
 */
export const sirhVariablesPaie = pgTable(
  'sirh_variables_paie',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    periodeId: uuid('periode_id')
      .notNull()
      .references(() => sirhPeriodesPaie.id, { onDelete: 'cascade' }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    typeVariable: sirhTypeVariablePaie('type_variable').notNull().default('prime'),
    libelle: text('libelle').notNull(),
    codeRubrique: text('code_rubrique'),
    quantite: numeric('quantite', { precision: 10, scale: 2 }),
    montant: numeric('montant', { precision: 12, scale: 2 }),
    source: sirhSourceVariable('source').notNull().default('manuelle'),
    sourceId: uuid('source_id'),
    commentaire: text('commentaire'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_variables_paie_periode')
      .on(t.periodeId, t.employeId)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_sirh_variables_paie_source')
      .on(t.periodeId, t.source, t.sourceId)
      .where(sql`source_id IS NOT NULL AND deleted_at IS NULL`),
    check('chk_sirh_variables_paie_valeur', sql`quantite IS NOT NULL OR montant IS NOT NULL`),
    check('chk_sirh_variables_paie_source', sql`source = 'manuelle' OR source_id IS NOT NULL`),
  ],
);
export type SirhVariablePaie = typeof sirhVariablesPaie.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Recrutement (Factorial ats)
// ─────────────────────────────────────────────────────────────

/** Offres d'emploi (Factorial ats/JobPosting). */
export const sirhOffres = pgTable(
  'sirh_offres',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    reference: text('reference'),
    titre: text('titre').notNull(),
    posteId: uuid('poste_id').references(() => sirhPostes.id, { onDelete: 'set null' }),
    siteId: uuid('site_id').references(() => sirhSites.id, { onDelete: 'set null' }),
    typeContrat: sirhTypeContrat('type_contrat').notNull().default('cdi'),
    description: text('description'),
    profilRecherche: text('profil_recherche'),
    nbPostes: integer('nb_postes').notNull().default(1),
    salaireMin: numeric('salaire_min', { precision: 12, scale: 2 }),
    salaireMax: numeric('salaire_max', { precision: 12, scale: 2 }),
    statut: sirhStatutOffre('statut').notNull().default('brouillon'),
    datePublication: date('date_publication'),
    dateCloture: date('date_cloture'),
    responsableId: uuid('responsable_id').references(() => employes.id, { onDelete: 'set null' }),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_offres_reference_actif')
      .on(t.entrepriseId, t.reference)
      .where(sql`reference IS NOT NULL AND deleted_at IS NULL`),
    index('idx_sirh_offres_statut')
      .on(t.entrepriseId, t.statut)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_offres_postes', sql`nb_postes BETWEEN 1 AND 999`),
    check(
      'chk_sirh_offres_salaire',
      sql`(salaire_min IS NULL OR salaire_min >= 0) AND (salaire_max IS NULL OR salaire_max >= 0)
        AND (salaire_min IS NULL OR salaire_max IS NULL OR salaire_max >= salaire_min)`,
    ),
    check(
      'chk_sirh_offres_dates',
      sql`date_cloture IS NULL OR date_publication IS NULL OR date_cloture >= date_publication`,
    ),
  ],
);
export type SirhOffre = typeof sirhOffres.$inferSelect;

/** Candidatures (Factorial ats/Application + HiringStage). */
export const sirhCandidatures = pgTable(
  'sirh_candidatures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    offreId: uuid('offre_id')
      .notNull()
      .references(() => sirhOffres.id, { onDelete: 'restrict' }),
    candidatId: uuid('candidat_id')
      .notNull()
      .references(() => sirhCandidats.id, { onDelete: 'cascade' }),
    etape: sirhEtapeCandidature('etape').notNull().default('nouvelle'),
    dateCandidature: date('date_candidature')
      .notNull()
      .default(sql`CURRENT_DATE`),
    note: integer('note'),
    motifRefus: sirhMotifRefus('motif_refus'),
    dateEntretien: timestamp('date_entretien', { withTimezone: true }),
    commentaire: text('commentaire'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_candidatures_actif')
      .on(t.offreId, t.candidatId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_candidatures_candidat')
      .on(t.candidatId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_candidatures_etape')
      .on(t.offreId, t.etape)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_candidatures_note', sql`note IS NULL OR note BETWEEN 1 AND 5`),
    check('chk_sirh_candidatures_refus', sql`motif_refus IS NULL OR etape = 'refusee'`),
  ],
);
export type SirhCandidature = typeof sirhCandidatures.$inferSelect;

/** Avis des évaluateurs sur une candidature (Factorial ats/Feedback). */
export const sirhCandidatureAvis = pgTable(
  'sirh_candidature_avis',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    candidatureId: uuid('candidature_id')
      .notNull()
      .references(() => sirhCandidatures.id, { onDelete: 'cascade' }),
    auteurId: text('auteur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
    note: integer('note'),
    avis: sirhAvisRecrutement('avis').notNull().default('reserve'),
    commentaire: text('commentaire'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_candidature_avis_candidature')
      .on(t.candidatureId)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_candidature_avis_note', sql`note IS NULL OR note BETWEEN 1 AND 5`),
  ],
);
export type SirhCandidatureAvis = typeof sirhCandidatureAvis.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Entretiens & performance (Factorial performance)
// ─────────────────────────────────────────────────────────────

/** Campagnes d'entretiens (Factorial performance/ReviewProcess). */
export const sirhCampagnesEntretiens = pgTable(
  'sirh_campagnes_entretiens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    libelle: text('libelle').notNull(),
    typeEntretien: sirhTypeEntretien('type_entretien').notNull().default('annuel'),
    dateDebut: date('date_debut'),
    dateLimite: date('date_limite'),
    statut: sirhStatutCampagne('statut').notNull().default('brouillon'),
    description: text('description'),
    ...colonnesAudit(),
  },
  () => [
    check(
      'chk_sirh_campagnes_dates',
      sql`date_limite IS NULL OR date_debut IS NULL OR date_limite >= date_debut`,
    ),
  ],
);
export type SirhCampagneEntretiens = typeof sirhCampagnesEntretiens.$inferSelect;

/** Entretiens individuels (Factorial performance/ReviewEvaluation). */
export const sirhEntretiens = pgTable(
  'sirh_entretiens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    campagneId: uuid('campagne_id').references(() => sirhCampagnesEntretiens.id, {
      onDelete: 'set null',
    }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    evaluateurId: uuid('evaluateur_id').references(() => employes.id, { onDelete: 'set null' }),
    typeEntretien: sirhTypeEntretien('type_entretien').notNull().default('annuel'),
    datePrevue: date('date_prevue'),
    dateRealisation: date('date_realisation'),
    statut: sirhStatutEntretien('statut').notNull().default('a_planifier'),
    noteGlobale: integer('note_globale'),
    synthese: text('synthese'),
    pointsForts: text('points_forts'),
    axesAmelioration: text('axes_amelioration'),
    souhaitsFormation: text('souhaits_formation'),
    souhaitsEvolution: text('souhaits_evolution'),
    commentaireSalarie: text('commentaire_salarie'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_entretiens_employe')
      .on(t.employeId, t.dateRealisation)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_entretiens_campagne')
      .on(t.campagneId)
      .where(sql`deleted_at IS NULL`),
    uniqueIndex('uq_sirh_entretiens_campagne_employe')
      .on(t.campagneId, t.employeId)
      .where(sql`campagne_id IS NOT NULL AND deleted_at IS NULL`),
    check('chk_sirh_entretiens_note', sql`note_globale IS NULL OR note_globale BETWEEN 1 AND 5`),
    check(
      'chk_sirh_entretiens_realise',
      sql`statut NOT IN ('realise','signe') OR date_realisation IS NOT NULL`,
    ),
  ],
);
export type SirhEntretien = typeof sirhEntretiens.$inferSelect;

/** Objectifs individuels (Factorial performance/ReviewProcessTarget). */
export const sirhObjectifs = pgTable(
  'sirh_objectifs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    entretienId: uuid('entretien_id').references(() => sirhEntretiens.id, {
      onDelete: 'set null',
    }),
    libelle: text('libelle').notNull(),
    description: text('description'),
    dateEcheance: date('date_echeance'),
    poids: integer('poids'),
    progression: integer('progression').notNull().default(0),
    statut: sirhStatutObjectif('statut').notNull().default('en_cours'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_objectifs_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_objectifs_entretien').on(t.entretienId),
    check('chk_sirh_objectifs_poids', sql`poids IS NULL OR poids BETWEEN 0 AND 100`),
    check('chk_sirh_objectifs_progression', sql`progression BETWEEN 0 AND 100`),
  ],
);
export type SirhObjectif = typeof sirhObjectifs.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Formation (Factorial trainings)
// ─────────────────────────────────────────────────────────────

/** Catalogue de formations (Factorial trainings/Training + Category). */
export const sirhFormations = pgTable(
  'sirh_formations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    code: text('code'),
    intitule: text('intitule').notNull(),
    categorie: sirhCategorieFormation('categorie').notNull().default('technique'),
    organisme: text('organisme'),
    modalite: sirhModaliteFormation('modalite').notNull().default('presentiel'),
    dureeHeures: numeric('duree_heures', { precision: 6, scale: 2 }),
    coutHt: numeric('cout_ht', { precision: 12, scale: 2 }),
    obligatoire: boolean('obligatoire').notNull().default(false),
    /** Validité de la qualification en mois (recyclage). NULL = sans échéance. */
    validiteMois: integer('validite_mois'),
    description: text('description'),
    actif: boolean('actif').notNull().default(true),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_formations_code_actif')
      .on(t.entrepriseId, t.code)
      .where(sql`code IS NOT NULL AND deleted_at IS NULL`),
    check('chk_sirh_formations_duree', sql`duree_heures IS NULL OR duree_heures > 0`),
    check('chk_sirh_formations_cout', sql`cout_ht IS NULL OR cout_ht >= 0`),
    check(
      'chk_sirh_formations_validite',
      sql`validite_mois IS NULL OR validite_mois BETWEEN 1 AND 240`,
    ),
  ],
);
export type SirhFormation = typeof sirhFormations.$inferSelect;

/** Sessions de formation (Factorial trainings/Session). */
export const sirhSessionsFormation = pgTable(
  'sirh_sessions_formation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => sirhFormations.id, { onDelete: 'restrict' }),
    dateDebut: date('date_debut').notNull(),
    dateFin: date('date_fin').notNull(),
    lieu: text('lieu'),
    formateur: text('formateur'),
    placesMax: integer('places_max'),
    coutHt: numeric('cout_ht', { precision: 12, scale: 2 }),
    statut: sirhStatutSession('statut').notNull().default('planifiee'),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_sessions_formation')
      .on(t.formationId, t.dateDebut)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_sessions_dates', sql`date_fin >= date_debut`),
    check('chk_sirh_sessions_places', sql`places_max IS NULL OR places_max > 0`),
    check('chk_sirh_sessions_cout', sql`cout_ht IS NULL OR cout_ht >= 0`),
  ],
);
export type SirhSessionFormation = typeof sirhSessionsFormation.$inferSelect;

/** Inscriptions et présence (Factorial trainings/TrainingMembership + SessionAttendance). */
export const sirhInscriptionsFormation = pgTable(
  'sirh_inscriptions_formation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sirhSessionsFormation.id, { onDelete: 'cascade' }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    statut: sirhStatutInscription('statut').notNull().default('inscrit'),
    resultat: sirhResultatFormation('resultat').notNull().default('non_evalue'),
    heuresRealisees: numeric('heures_realisees', { precision: 6, scale: 2 }),
    /** Échéance de la qualification (fin de session + validité de la formation). */
    dateValidite: date('date_validite'),
    commentaire: text('commentaire'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_inscriptions_actif')
      .on(t.sessionId, t.employeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_inscriptions_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_inscriptions_validite')
      .on(t.entrepriseId, t.dateValidite)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_inscriptions_heures', sql`heures_realisees IS NULL OR heures_realisees >= 0`),
  ],
);
export type SirhInscriptionFormation = typeof sirhInscriptionsFormation.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Onboarding / processus & tâches (Factorial processes + tasks)
// ─────────────────────────────────────────────────────────────

/** Modèles de processus (onboarding, offboarding…) — Factorial processes/Process. */
export const sirhModelesProcessus = pgTable(
  'sirh_modeles_processus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    nom: text('nom').notNull(),
    typeProcessus: sirhTypeProcessus('type_processus').notNull().default('onboarding'),
    description: text('description'),
    actif: boolean('actif').notNull().default(true),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_modeles_processus_nom_actif')
      .on(t.entrepriseId, t.nom)
      .where(sql`deleted_at IS NULL`),
  ],
);
export type SirhModeleProcessus = typeof sirhModelesProcessus.$inferSelect;

/** Tâches d'un modèle de processus. */
export const sirhModeleTaches = pgTable(
  'sirh_modele_taches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    modeleId: uuid('modele_id')
      .notNull()
      .references(() => sirhModelesProcessus.id, { onDelete: 'cascade' }),
    libelle: text('libelle').notNull(),
    description: text('description'),
    responsable: sirhResponsableTache('responsable').notNull().default('rh'),
    /** Échéance relative à la date de référence du processus (négatif = avant). */
    delaiJours: integer('delai_jours').notNull().default(0),
    ordre: integer('ordre').notNull().default(0),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_modele_taches_modele')
      .on(t.modeleId, t.ordre)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_modele_taches_delai', sql`delai_jours BETWEEN -365 AND 365`),
  ],
);
export type SirhModeleTache = typeof sirhModeleTaches.$inferSelect;

/** Processus lancé pour un collaborateur (Factorial processes/MaterializedProcess). */
export const sirhProcessus = pgTable(
  'sirh_processus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    modeleId: uuid('modele_id').references(() => sirhModelesProcessus.id, {
      onDelete: 'set null',
    }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    typeProcessus: sirhTypeProcessus('type_processus').notNull().default('onboarding'),
    libelle: text('libelle').notNull(),
    /** Date pivot (arrivée, départ, mobilité) à partir de laquelle les échéances sont calculées. */
    dateReference: date('date_reference').notNull(),
    statut: sirhStatutProcessus('statut').notNull().default('en_cours'),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_processus_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_processus_statut')
      .on(t.entrepriseId, t.statut)
      .where(sql`deleted_at IS NULL`),
  ],
);
export type SirhProcessus = typeof sirhProcessus.$inferSelect;

/** Tâches RH (Factorial tasks/Task) — rattachées à un processus ou autonomes. */
export const sirhTaches = pgTable(
  'sirh_taches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    processusId: uuid('processus_id').references(() => sirhProcessus.id, {
      onDelete: 'cascade',
    }),
    employeId: uuid('employe_id').references(() => employes.id, { onDelete: 'set null' }),
    libelle: text('libelle').notNull(),
    description: text('description'),
    responsable: sirhResponsableTache('responsable').notNull().default('rh'),
    assigneA: text('assigne_a').references(() => utilisateurs.id, { onDelete: 'set null' }),
    echeance: date('echeance'),
    statut: sirhStatutTache('statut').notNull().default('a_faire'),
    dateRealisation: date('date_realisation'),
    ordre: integer('ordre').notNull().default(0),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_taches_processus')
      .on(t.processusId, t.ordre)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_taches_assigne')
      .on(t.assigneA, t.statut)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_taches_echeance')
      .on(t.entrepriseId, t.echeance)
      .where(sql`deleted_at IS NULL`),
    index('idx_sirh_taches_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_taches_realisation', sql`statut <> 'faite' OR date_realisation IS NOT NULL`),
  ],
);
export type SirhTache = typeof sirhTaches.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Matériel & dotations (Factorial it_management, étendu EPI / outillage)
// ─────────────────────────────────────────────────────────────

export const sirhMateriels = pgTable(
  'sirh_materiels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    categorie: sirhCategorieMateriel('categorie').notNull().default('autre'),
    libelle: text('libelle').notNull(),
    marque: text('marque'),
    modele: text('modele'),
    numeroSerie: text('numero_serie'),
    /** Taille (EPI, vêtements de travail). */
    taille: text('taille'),
    dateAchat: date('date_achat'),
    valeurAchat: numeric('valeur_achat', { precision: 12, scale: 2 }),
    dateFinGarantie: date('date_fin_garantie'),
    /** Prochain contrôle périodique / péremption (EPI antichute…). */
    dateControle: date('date_controle'),
    statut: sirhStatutMateriel('statut').notNull().default('en_stock'),
    notes: text('notes'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_materiels_serie_actif')
      .on(t.entrepriseId, t.numeroSerie)
      .where(sql`numero_serie IS NOT NULL AND deleted_at IS NULL`),
    index('idx_sirh_materiels_statut')
      .on(t.entrepriseId, t.statut)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_materiels_valeur', sql`valeur_achat IS NULL OR valeur_achat >= 0`),
  ],
);
export type SirhMateriel = typeof sirhMateriels.$inferSelect;

/** Remises / retours de matériel (une attribution en cours max par matériel). */
export const sirhAttributionsMateriel = pgTable(
  'sirh_attributions_materiel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    materielId: uuid('materiel_id')
      .notNull()
      .references(() => sirhMateriels.id, { onDelete: 'cascade' }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    dateRemise: date('date_remise').notNull(),
    dateRetour: date('date_retour'),
    etatRemise: text('etat_remise'),
    etatRetour: text('etat_retour'),
    dechargeSignee: boolean('decharge_signee').notNull().default(false),
    commentaire: text('commentaire'),
    ...colonnesAudit(),
  },
  (t) => [
    uniqueIndex('uq_sirh_attributions_en_cours')
      .on(t.materielId)
      .where(sql`date_retour IS NULL AND deleted_at IS NULL`),
    index('idx_sirh_attributions_employe')
      .on(t.employeId)
      .where(sql`deleted_at IS NULL`),
    check('chk_sirh_attributions_dates', sql`date_retour IS NULL OR date_retour >= date_remise`),
  ],
);
export type SirhAttributionMateriel = typeof sirhAttributionsMateriel.$inferSelect;

// ─────────────────────────────────────────────────────────────
// Communication interne (Factorial posts)
// ─────────────────────────────────────────────────────────────

export const sirhAnnonces = pgTable(
  'sirh_annonces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: colonneEntreprise(),
    titre: text('titre').notNull(),
    contenu: text('contenu').notNull(),
    categorie: sirhCategorieAnnonce('categorie').notNull().default('information'),
    epinglee: boolean('epinglee').notNull().default(false),
    publiee: boolean('publiee').notNull().default(true),
    datePublication: date('date_publication')
      .notNull()
      .default(sql`CURRENT_DATE`),
    dateExpiration: date('date_expiration'),
    auteurId: text('auteur_id').references(() => utilisateurs.id, { onDelete: 'set null' }),
    /** Audience restreinte (NULL = toute l'entreprise). */
    siteId: uuid('site_id').references(() => sirhSites.id, { onDelete: 'set null' }),
    equipeId: uuid('equipe_id').references(() => sirhEquipes.id, { onDelete: 'set null' }),
    ...colonnesAudit(),
  },
  (t) => [
    index('idx_sirh_annonces_publication')
      .on(t.entrepriseId, t.datePublication)
      .where(sql`deleted_at IS NULL`),
    check(
      'chk_sirh_annonces_dates',
      sql`date_expiration IS NULL OR date_expiration >= date_publication`,
    ),
  ],
);
export type SirhAnnonce = typeof sirhAnnonces.$inferSelect;
