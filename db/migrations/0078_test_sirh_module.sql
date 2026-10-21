-- 0078_test_sirh_module.sql
-- Module « Test SIRH » (option par entreprise `entreprises.test_sirh_active`, posée par 0079).
--
-- SIRH natif construit d'après le périmètre fonctionnel de l'API Factorial
-- (https://apidoc.factorialhr.com) — AUCUNE dépendance au SaaS : seul le modèle
-- fonctionnel est repris. Le module s'appuie sur la table `employes` existante
-- (source unique des collaborateurs) et ne fait qu'y ajouter des données SIRH.
--
-- Correspondance namespaces Factorial → tables :
--   locations / teams / job_catalog          → sirh_sites, sirh_equipes(+_membres), sirh_postes
--   employees (extension)                    → sirh_collaborateurs
--   contracts                                → sirh_contrats
--   payroll / compensations                  → sirh_periodes_paie, sirh_variables_paie
--   timeoff / holidays                       → sirh_types_absence, sirh_compteurs(+_ajustements),
--                                              sirh_absences, sirh_periodes_bloquees, sirh_jours_feries
--   work_schedule / attendance               → sirh_horaires, sirh_badgeages, sirh_heures_sup
--   expenses (Expense / Mileage / PerDiem)   → sirh_notes_frais
--   documents                                → sirh_dossiers_documents, sirh_documents
--   ats                                      → sirh_offres, sirh_candidats, sirh_candidatures,
--                                              sirh_candidature_avis
--   performance                              → sirh_campagnes_entretiens, sirh_entretiens, sirh_objectifs
--   trainings                                → sirh_formations, sirh_sessions_formation,
--                                              sirh_inscriptions_formation
--   processes / tasks                        → sirh_modeles_processus, sirh_modele_taches,
--                                              sirh_processus, sirh_taches
--   it_management                            → sirh_materiels, sirh_attributions_materiel
--   posts                                    → sirh_annonces
--
-- Conventions (cf. 0075 flotte) : colonnes d'audit + soft-delete partout, RLS p_tenant
-- (FORCE), GRANT app_rw, trigger updated_at, héritage entreprise_id des tables filles via
-- trg_inherit_entreprise_id (0044). Salaires des contrats chiffrés applicativement (BYTEA).
-- Migration idempotente.

BEGIN;

-- ── 1. Enums ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  def RECORD;
BEGIN
  FOR def IN
    SELECT * FROM (VALUES
      ('sirh_type_site',            ARRAY['siege','agence','depot','atelier','bureau_chantier','autre']),
      ('sirh_type_contrat',         ARRAY['cdi','cdd','cdi_chantier','interim','apprentissage','professionnalisation','stage','saisonnier','autre']),
      ('sirh_temps_travail',        ARRAY['temps_plein','temps_partiel','forfait_jours']),
      ('sirh_motif_fin_contrat',    ARRAY['fin_cdd','fin_chantier','demission','licenciement','rupture_conventionnelle','fin_periode_essai','retraite','deces','mutation','autre']),
      ('sirh_statut_periode_paie',  ARRAY['ouverte','en_controle','cloturee']),
      ('sirh_type_variable_paie',   ARRAY['prime','heures_supplementaires','indemnite','avance','acompte','retenue','avantage_nature','remboursement_frais','absence','autre']),
      ('sirh_source_variable',      ARRAY['manuelle','absence','heures_sup','note_frais']),
      ('sirh_categorie_absence',    ARRAY['conges','maladie','familial','formation','sans_solde','intemperies','autre']),
      ('sirh_unite_decompte',       ARRAY['jours_ouvrables','jours_ouvres','jours_calendaires','heures']),
      ('sirh_statut_demande',       ARRAY['brouillon','en_attente','approuvee','refusee','annulee']),
      ('sirh_lieu_travail',         ARRAY['chantier','atelier','bureau','teletravail','deplacement']),
      ('sirh_source_badgeage',      ARRAY['manuel','mobile','badgeuse','import']),
      ('sirh_compensation_hs',      ARRAY['paiement','recuperation']),
      ('sirh_nature_frais',         ARRAY['depense','indemnite_km','forfait']),
      ('sirh_categorie_frais',      ARRAY['repas','hebergement','transport','carburant','peage_parking','fournitures','telephone','panier','grand_deplacement','autre']),
      ('sirh_statut_frais',         ARRAY['brouillon','soumise','approuvee','refusee','remboursee']),
      ('sirh_statut_offre',         ARRAY['brouillon','publiee','suspendue','pourvue','fermee']),
      ('sirh_source_candidat',      ARRAY['candidature_spontanee','site_carriere','france_travail','job_board','reseaux_sociaux','cooptation','ecole','interim','autre']),
      ('sirh_etape_candidature',    ARRAY['nouvelle','preselection','entretien_rh','entretien_technique','proposition','embauche','refusee','desistement']),
      ('sirh_motif_refus',          ARRAY['profil_inadequat','experience_insuffisante','pretentions_salariales','poste_pourvu','desistement_candidat','autre']),
      ('sirh_avis_recrutement',     ARRAY['favorable','reserve','defavorable']),
      ('sirh_type_entretien',       ARRAY['annuel','professionnel','fin_periode_essai','mi_annee','bilan_6_ans','autre']),
      ('sirh_statut_campagne',      ARRAY['brouillon','en_cours','cloturee']),
      ('sirh_statut_entretien',     ARRAY['a_planifier','planifie','realise','signe','annule']),
      ('sirh_statut_objectif',      ARRAY['en_cours','atteint','partiellement_atteint','non_atteint','abandonne']),
      ('sirh_categorie_formation',  ARRAY['securite','technique','reglementaire','management','bureautique','langues','autre']),
      ('sirh_modalite_formation',   ARRAY['presentiel','distanciel','mixte','interne']),
      ('sirh_statut_session',       ARRAY['planifiee','confirmee','realisee','annulee']),
      ('sirh_statut_inscription',   ARRAY['inscrit','present','absent','annule']),
      ('sirh_resultat_formation',   ARRAY['non_evalue','reussi','echoue']),
      ('sirh_type_processus',       ARRAY['onboarding','offboarding','mobilite','autre']),
      ('sirh_responsable_tache',    ARRAY['rh','manager','salarie','it','autre']),
      ('sirh_statut_processus',     ARRAY['en_cours','termine','annule']),
      ('sirh_statut_tache',         ARRAY['a_faire','en_cours','faite','annulee']),
      ('sirh_categorie_materiel',   ARRAY['informatique','telephonie','epi','outillage','badge_cle','vetement','autre']),
      ('sirh_statut_materiel',      ARRAY['en_stock','attribue','en_reparation','perdu','reforme']),
      ('sirh_categorie_annonce',    ARRAY['information','securite','evenement','rh','autre'])
    ) AS t(nom, valeurs)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = def.nom) THEN
      EXECUTE format(
        'CREATE TYPE %I AS ENUM (%s)',
        def.nom,
        (SELECT string_agg(quote_literal(v), ',') FROM unnest(def.valeurs) AS v)
      );
    END IF;
  END LOOP;
END $$;

-- ── 2. Organisation ─────────────────────────────────────────────────────────

-- Lieux de travail (Factorial locations/Location).
CREATE TABLE IF NOT EXISTS sirh_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  code TEXT,
  nom TEXT NOT NULL,
  type_site sirh_type_site NOT NULL DEFAULT 'agence',
  adresse_ligne1 TEXT,
  adresse_ligne2 TEXT,
  code_postal TEXT,
  ville TEXT,
  pays TEXT NOT NULL DEFAULT 'France',
  telephone TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_sites_code_postal CHECK (code_postal IS NULL OR code_postal ~ '^[0-9]{5}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_sites_nom_actif
  ON sirh_sites (entreprise_id, nom) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_sites_code_actif
  ON sirh_sites (entreprise_id, code) WHERE code IS NOT NULL AND deleted_at IS NULL;

-- Catalogue des postes (Factorial job_catalog Role + Level).
CREATE TABLE IF NOT EXISTS sirh_postes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  code TEXT,
  intitule TEXT NOT NULL,
  famille TEXT,
  categorie classification_employe,
  niveau TEXT,
  coefficient TEXT,
  description TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_postes_code_actif
  ON sirh_postes (entreprise_id, code) WHERE code IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_postes_entreprise
  ON sirh_postes (entreprise_id) WHERE deleted_at IS NULL;

-- Horaires de travail (Factorial work_schedule Schedule + DayConfiguration).
CREATE TABLE IF NOT EXISTS sirh_horaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  nom TEXT NOT NULL,
  description TEXT,
  heures_lundi NUMERIC(4,2) NOT NULL DEFAULT 7,
  heures_mardi NUMERIC(4,2) NOT NULL DEFAULT 7,
  heures_mercredi NUMERIC(4,2) NOT NULL DEFAULT 7,
  heures_jeudi NUMERIC(4,2) NOT NULL DEFAULT 7,
  heures_vendredi NUMERIC(4,2) NOT NULL DEFAULT 7,
  heures_samedi NUMERIC(4,2) NOT NULL DEFAULT 0,
  heures_dimanche NUMERIC(4,2) NOT NULL DEFAULT 0,
  par_defaut BOOLEAN NOT NULL DEFAULT false,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_horaires_heures CHECK (
    heures_lundi BETWEEN 0 AND 24 AND heures_mardi BETWEEN 0 AND 24
    AND heures_mercredi BETWEEN 0 AND 24 AND heures_jeudi BETWEEN 0 AND 24
    AND heures_vendredi BETWEEN 0 AND 24 AND heures_samedi BETWEEN 0 AND 24
    AND heures_dimanche BETWEEN 0 AND 24
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_horaires_nom_actif
  ON sirh_horaires (entreprise_id, nom) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_horaires_defaut
  ON sirh_horaires (entreprise_id) WHERE par_defaut AND deleted_at IS NULL;

-- Équipes (Factorial teams/Team).
CREATE TABLE IF NOT EXISTS sirh_equipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  nom TEXT NOT NULL,
  description TEXT,
  responsable_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sirh_sites(id) ON DELETE SET NULL,
  couleur TEXT NOT NULL DEFAULT '#f59e0b',
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_equipes_couleur CHECK (couleur ~ '^#[0-9a-fA-F]{6}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_equipes_nom_actif
  ON sirh_equipes (entreprise_id, nom) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_equipes_responsable ON sirh_equipes (responsable_id);
CREATE INDEX IF NOT EXISTS idx_sirh_equipes_site ON sirh_equipes (site_id);

-- Membres d'équipe (Factorial teams/Membership).
CREATE TABLE IF NOT EXISTS sirh_equipe_membres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  equipe_id UUID NOT NULL REFERENCES sirh_equipes(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  est_responsable BOOLEAN NOT NULL DEFAULT false,
  date_debut DATE,
  date_fin DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_equipe_membres_dates CHECK (
    date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_equipe_membres_actif
  ON sirh_equipe_membres (equipe_id, employe_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_equipe_membres_employe
  ON sirh_equipe_membres (employe_id) WHERE deleted_at IS NULL;

-- ── 3. Collaborateurs & contrats ────────────────────────────────────────────

-- Extension SIRH 1-1 d'un employé (Factorial employees/Employee : manager, lieu, poste…).
CREATE TABLE IF NOT EXISTS sirh_collaborateurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  poste_id UUID REFERENCES sirh_postes(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sirh_sites(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  horaire_id UUID REFERENCES sirh_horaires(id) ON DELETE SET NULL,
  societe_id UUID REFERENCES societes(id) ON DELETE SET NULL,
  email_professionnel TEXT,
  telephone_professionnel TEXT,
  date_anciennete DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_collaborateurs_manager CHECK (manager_id IS NULL OR manager_id <> employe_id),
  CONSTRAINT chk_sirh_collaborateurs_email CHECK (
    email_professionnel IS NULL OR email_professionnel ~ '@'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_collaborateurs_employe
  ON sirh_collaborateurs (employe_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_collaborateurs_manager ON sirh_collaborateurs (manager_id);
CREATE INDEX IF NOT EXISTS idx_sirh_collaborateurs_site ON sirh_collaborateurs (site_id);
CREATE INDEX IF NOT EXISTS idx_sirh_collaborateurs_poste ON sirh_collaborateurs (poste_id);

-- Versions de contrat (Factorial contracts/ContractVersion + Compensation).
CREATE TABLE IF NOT EXISTS sirh_contrats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  type_contrat sirh_type_contrat NOT NULL DEFAULT 'cdi',
  motif_recours TEXT,
  date_debut DATE NOT NULL,
  date_fin DATE,
  date_fin_periode_essai DATE,
  motif_fin sirh_motif_fin_contrat,
  poste_id UUID REFERENCES sirh_postes(id) ON DELETE SET NULL,
  intitule_poste TEXT,
  categorie classification_employe,
  niveau TEXT,
  coefficient TEXT,
  temps_travail sirh_temps_travail NOT NULL DEFAULT 'temps_plein',
  heures_hebdo NUMERIC(5,2),
  jours_forfait INTEGER,
  -- Rémunération : chiffrée applicativement (AES-256-GCM, lib/crypto) → BYTEA.
  salaire_brut_mensuel BYTEA,
  taux_horaire_brut BYTEA,
  convention_collective TEXT DEFAULT 'BTP',
  societe_id UUID REFERENCES societes(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sirh_sites(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_contrats_dates CHECK (date_fin IS NULL OR date_fin >= date_debut),
  CONSTRAINT chk_sirh_contrats_essai CHECK (
    date_fin_periode_essai IS NULL OR date_fin_periode_essai >= date_debut
  ),
  CONSTRAINT chk_sirh_contrats_heures CHECK (
    heures_hebdo IS NULL OR (heures_hebdo > 0 AND heures_hebdo <= 48)
  ),
  CONSTRAINT chk_sirh_contrats_forfait CHECK (
    jours_forfait IS NULL OR (jours_forfait > 0 AND jours_forfait <= 235)
  ),
  CONSTRAINT chk_sirh_contrats_motif_fin CHECK (motif_fin IS NULL OR date_fin IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sirh_contrats_employe
  ON sirh_contrats (employe_id, date_debut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_contrats_fin
  ON sirh_contrats (entreprise_id, date_fin) WHERE deleted_at IS NULL;

-- ── 4. Paie ─────────────────────────────────────────────────────────────────

-- Périodes de paie mensuelles (Factorial payroll/PolicyPeriod, compensations/PayrollRun).
CREATE TABLE IF NOT EXISTS sirh_periodes_paie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  annee INTEGER NOT NULL,
  mois INTEGER NOT NULL,
  statut sirh_statut_periode_paie NOT NULL DEFAULT 'ouverte',
  date_cloture TIMESTAMPTZ,
  cloture_par TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_periodes_paie_mois CHECK (mois BETWEEN 1 AND 12),
  CONSTRAINT chk_sirh_periodes_paie_annee CHECK (annee BETWEEN 2000 AND 2100)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_periodes_paie_mois
  ON sirh_periodes_paie (entreprise_id, annee, mois) WHERE deleted_at IS NULL;

-- ── 5. Documents (créés tôt : référencés par absences et notes de frais) ────

-- Dossiers de la GED RH (Factorial documents/Folder).
CREATE TABLE IF NOT EXISTS sirh_dossiers_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  nom TEXT NOT NULL,
  description TEXT,
  visible_salarie BOOLEAN NOT NULL DEFAULT false,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_dossiers_documents_nom_actif
  ON sirh_dossiers_documents (entreprise_id, nom) WHERE deleted_at IS NULL;

-- Candidats (Factorial ats/Candidate) — créés avant sirh_documents (CV).
CREATE TABLE IF NOT EXISTS sirh_candidats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  ville TEXT,
  source sirh_source_candidat NOT NULL DEFAULT 'candidature_spontanee',
  consentement_rgpd BOOLEAN NOT NULL DEFAULT false,
  date_consentement DATE,
  employe_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_candidats_email CHECK (email IS NULL OR email ~ '@')
);
CREATE INDEX IF NOT EXISTS idx_sirh_candidats_nom
  ON sirh_candidats (entreprise_id, nom, prenom) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_candidats_email_actif
  ON sirh_candidats (entreprise_id, lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;

-- Documents RH (Factorial documents/Document) — fichiers en MinIO.
-- employe_id NULL = document d'entreprise ; candidat_id = CV / pièces de candidature.
CREATE TABLE IF NOT EXISTS sirh_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  dossier_id UUID REFERENCES sirh_dossiers_documents(id) ON DELETE SET NULL,
  employe_id UUID REFERENCES employes(id) ON DELETE RESTRICT,
  candidat_id UUID REFERENCES sirh_candidats(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  minio_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  taille_bytes BIGINT,
  date_document DATE,
  date_expiration DATE,
  visible_salarie BOOLEAN NOT NULL DEFAULT false,
  signature_requise BOOLEAN NOT NULL DEFAULT false,
  signe_le TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_documents_taille CHECK (taille_bytes IS NULL OR taille_bytes > 0)
);
CREATE INDEX IF NOT EXISTS idx_sirh_documents_employe
  ON sirh_documents (employe_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_documents_dossier
  ON sirh_documents (dossier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_documents_candidat ON sirh_documents (candidat_id);
CREATE INDEX IF NOT EXISTS idx_sirh_documents_expiration
  ON sirh_documents (entreprise_id, date_expiration) WHERE deleted_at IS NULL;

-- ── 6. Temps & absences ─────────────────────────────────────────────────────

-- Types d'absence (Factorial timeoff/LeaveType + Policy simplifiée).
CREATE TABLE IF NOT EXISTS sirh_types_absence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  categorie sirh_categorie_absence NOT NULL DEFAULT 'conges',
  unite_decompte sirh_unite_decompte NOT NULL DEFAULT 'jours_ouvres',
  avec_solde BOOLEAN NOT NULL DEFAULT false,
  necessite_validation BOOLEAN NOT NULL DEFAULT true,
  justificatif_requis BOOLEAN NOT NULL DEFAULT false,
  remuneree BOOLEAN NOT NULL DEFAULT true,
  couleur TEXT NOT NULL DEFAULT '#f59e0b',
  code_rubrique_paie TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_types_absence_couleur CHECK (couleur ~ '^#[0-9a-fA-F]{6}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_types_absence_code_actif
  ON sirh_types_absence (entreprise_id, code) WHERE deleted_at IS NULL;

-- Compteurs de droits (Factorial timeoff/Allowance). Solde = droits + report
-- + Σ ajustements − Σ absences approuvées (calculé en applicatif).
CREATE TABLE IF NOT EXISTS sirh_compteurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  type_absence_id UUID NOT NULL REFERENCES sirh_types_absence(id) ON DELETE RESTRICT,
  periode_debut DATE NOT NULL,
  periode_fin DATE NOT NULL,
  droits_acquis NUMERIC(6,2) NOT NULL DEFAULT 0,
  report NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_compteurs_periode CHECK (periode_fin >= periode_debut),
  CONSTRAINT chk_sirh_compteurs_droits CHECK (droits_acquis >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_compteurs_periode
  ON sirh_compteurs (employe_id, type_absence_id, periode_debut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_compteurs_type ON sirh_compteurs (type_absence_id);

-- Ajustements manuels de compteur (Factorial timeoff/AllowanceIncidence).
CREATE TABLE IF NOT EXISTS sirh_compteur_ajustements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  compteur_id UUID NOT NULL REFERENCES sirh_compteurs(id) ON DELETE CASCADE,
  date_ajustement DATE NOT NULL,
  valeur NUMERIC(6,2) NOT NULL,
  motif TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_compteur_ajustements_valeur CHECK (valeur <> 0)
);
CREATE INDEX IF NOT EXISTS idx_sirh_compteur_ajustements_compteur
  ON sirh_compteur_ajustements (compteur_id) WHERE deleted_at IS NULL;

-- Demandes d'absence (Factorial timeoff/Leave) avec workflow de validation.
CREATE TABLE IF NOT EXISTS sirh_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  type_absence_id UUID NOT NULL REFERENCES sirh_types_absence(id) ON DELETE RESTRICT,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  -- true = commence l'après-midi (date_debut) / se termine à midi (date_fin).
  demi_journee_debut BOOLEAN NOT NULL DEFAULT false,
  demi_journee_fin BOOLEAN NOT NULL DEFAULT false,
  -- Durée décomptée (jours ou heures selon l'unité du type), figée à l'enregistrement.
  duree NUMERIC(6,2) NOT NULL DEFAULT 0,
  motif TEXT,
  statut sirh_statut_demande NOT NULL DEFAULT 'en_attente',
  demande_par TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  valideur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  date_decision TIMESTAMPTZ,
  commentaire_decision TEXT,
  justificatif_document_id UUID REFERENCES sirh_documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_absences_dates CHECK (date_fin >= date_debut),
  CONSTRAINT chk_sirh_absences_duree CHECK (duree >= 0),
  CONSTRAINT chk_sirh_absences_demi_journee CHECK (
    date_fin > date_debut OR NOT (demi_journee_debut AND demi_journee_fin)
  )
);
CREATE INDEX IF NOT EXISTS idx_sirh_absences_employe
  ON sirh_absences (employe_id, date_debut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_absences_periode
  ON sirh_absences (entreprise_id, date_debut, date_fin) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_absences_statut
  ON sirh_absences (entreprise_id, statut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_absences_type ON sirh_absences (type_absence_id);

-- Périodes bloquées (Factorial timeoff/BlockedPeriod).
CREATE TABLE IF NOT EXISTS sirh_periodes_bloquees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  libelle TEXT NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  type_absence_id UUID REFERENCES sirh_types_absence(id) ON DELETE CASCADE,
  equipe_id UUID REFERENCES sirh_equipes(id) ON DELETE CASCADE,
  motif TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_periodes_bloquees_dates CHECK (date_fin >= date_debut)
);
CREATE INDEX IF NOT EXISTS idx_sirh_periodes_bloquees_dates
  ON sirh_periodes_bloquees (entreprise_id, date_debut, date_fin) WHERE deleted_at IS NULL;

-- Jours fériés de l'entreprise (Factorial holidays/CompanyHoliday).
-- site_id NULL = tous les sites (ex. Alsace-Moselle : jours propres à un site).
CREATE TABLE IF NOT EXISTS sirh_jours_feries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  date_ferie DATE NOT NULL,
  libelle TEXT NOT NULL,
  site_id UUID REFERENCES sirh_sites(id) ON DELETE CASCADE,
  chome BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_jours_feries_global
  ON sirh_jours_feries (entreprise_id, date_ferie) WHERE site_id IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_jours_feries_site
  ON sirh_jours_feries (entreprise_id, date_ferie, site_id)
  WHERE site_id IS NOT NULL AND deleted_at IS NULL;

-- ── 7. Temps de travail ─────────────────────────────────────────────────────

-- Badgeages / pointages de présence (Factorial attendance/Shift).
-- heure_fin < heure_debut = poste de nuit (franchit minuit) ; NULL = en cours.
CREATE TABLE IF NOT EXISTS sirh_badgeages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  date_badgeage DATE NOT NULL,
  heure_debut TIME NOT NULL,
  heure_fin TIME,
  pause_minutes INTEGER NOT NULL DEFAULT 0,
  lieu sirh_lieu_travail NOT NULL DEFAULT 'chantier',
  chantier_id UUID REFERENCES chantiers(id) ON DELETE SET NULL,
  source sirh_source_badgeage NOT NULL DEFAULT 'manuel',
  valide BOOLEAN NOT NULL DEFAULT false,
  valide_par TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  valide_le TIMESTAMPTZ,
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_badgeages_pause CHECK (pause_minutes BETWEEN 0 AND 720)
);
CREATE INDEX IF NOT EXISTS idx_sirh_badgeages_employe
  ON sirh_badgeages (employe_id, date_badgeage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_badgeages_date
  ON sirh_badgeages (entreprise_id, date_badgeage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_badgeages_chantier ON sirh_badgeages (chantier_id);

-- Demandes d'heures supplémentaires (Factorial attendance/OvertimeRequest).
CREATE TABLE IF NOT EXISTS sirh_heures_sup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  date_heures DATE NOT NULL,
  duree_heures NUMERIC(5,2) NOT NULL,
  majoration_pct INTEGER NOT NULL DEFAULT 25,
  compensation sirh_compensation_hs NOT NULL DEFAULT 'paiement',
  motif TEXT,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE SET NULL,
  statut sirh_statut_demande NOT NULL DEFAULT 'en_attente',
  demande_par TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  valideur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  date_decision TIMESTAMPTZ,
  commentaire_decision TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_heures_sup_duree CHECK (duree_heures > 0 AND duree_heures <= 24),
  CONSTRAINT chk_sirh_heures_sup_majoration CHECK (majoration_pct IN (0, 10, 25, 50, 100))
);
CREATE INDEX IF NOT EXISTS idx_sirh_heures_sup_employe
  ON sirh_heures_sup (employe_id, date_heures) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_heures_sup_statut
  ON sirh_heures_sup (entreprise_id, statut) WHERE deleted_at IS NULL;

-- ── 8. Notes de frais (Factorial expenses : Expense / Mileage / PerDiem) ────
CREATE TABLE IF NOT EXISTS sirh_notes_frais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  date_depense DATE NOT NULL,
  nature sirh_nature_frais NOT NULL DEFAULT 'depense',
  categorie sirh_categorie_frais NOT NULL DEFAULT 'autre',
  libelle TEXT NOT NULL,
  montant_ttc NUMERIC(12,2) NOT NULL DEFAULT 0,
  montant_tva NUMERIC(12,2),
  -- Indemnités kilométriques
  distance_km NUMERIC(8,1),
  puissance_fiscale INTEGER,
  taux_km NUMERIC(6,3),
  -- Forfaits (panier, grand déplacement…)
  nb_forfaits NUMERIC(5,1),
  montant_unitaire NUMERIC(10,2),
  chantier_id UUID REFERENCES chantiers(id) ON DELETE SET NULL,
  justificatif_document_id UUID REFERENCES sirh_documents(id) ON DELETE SET NULL,
  statut sirh_statut_frais NOT NULL DEFAULT 'soumise',
  demande_par TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  valideur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  date_decision TIMESTAMPTZ,
  commentaire_decision TEXT,
  date_remboursement DATE,
  periode_paie_id UUID REFERENCES sirh_periodes_paie(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_notes_frais_montants CHECK (
    montant_ttc >= 0 AND (montant_tva IS NULL OR (montant_tva >= 0 AND montant_tva <= montant_ttc))
  ),
  CONSTRAINT chk_sirh_notes_frais_km CHECK (
    nature <> 'indemnite_km' OR (distance_km IS NOT NULL AND distance_km > 0)
  ),
  CONSTRAINT chk_sirh_notes_frais_forfait CHECK (
    nature <> 'forfait' OR (nb_forfaits IS NOT NULL AND nb_forfaits > 0)
  ),
  CONSTRAINT chk_sirh_notes_frais_cv CHECK (
    puissance_fiscale IS NULL OR (puissance_fiscale BETWEEN 1 AND 50)
  )
);
CREATE INDEX IF NOT EXISTS idx_sirh_notes_frais_employe
  ON sirh_notes_frais (employe_id, date_depense) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_notes_frais_statut
  ON sirh_notes_frais (entreprise_id, statut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_notes_frais_chantier ON sirh_notes_frais (chantier_id);

-- Variables de paie (Factorial payroll/Supplement) — saisies ou générées depuis
-- les absences / heures sup / notes de frais validées (source + source_id).
CREATE TABLE IF NOT EXISTS sirh_variables_paie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  periode_id UUID NOT NULL REFERENCES sirh_periodes_paie(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  type_variable sirh_type_variable_paie NOT NULL DEFAULT 'prime',
  libelle TEXT NOT NULL,
  code_rubrique TEXT,
  quantite NUMERIC(10,2),
  montant NUMERIC(12,2),
  source sirh_source_variable NOT NULL DEFAULT 'manuelle',
  source_id UUID,
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_variables_paie_valeur CHECK (quantite IS NOT NULL OR montant IS NOT NULL),
  CONSTRAINT chk_sirh_variables_paie_source CHECK (source = 'manuelle' OR source_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sirh_variables_paie_periode
  ON sirh_variables_paie (periode_id, employe_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_variables_paie_source
  ON sirh_variables_paie (periode_id, source, source_id)
  WHERE source_id IS NOT NULL AND deleted_at IS NULL;

-- ── 9. Recrutement (Factorial ats) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sirh_offres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  reference TEXT,
  titre TEXT NOT NULL,
  poste_id UUID REFERENCES sirh_postes(id) ON DELETE SET NULL,
  site_id UUID REFERENCES sirh_sites(id) ON DELETE SET NULL,
  type_contrat sirh_type_contrat NOT NULL DEFAULT 'cdi',
  description TEXT,
  profil_recherche TEXT,
  nb_postes INTEGER NOT NULL DEFAULT 1,
  salaire_min NUMERIC(12,2),
  salaire_max NUMERIC(12,2),
  statut sirh_statut_offre NOT NULL DEFAULT 'brouillon',
  date_publication DATE,
  date_cloture DATE,
  responsable_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_offres_postes CHECK (nb_postes BETWEEN 1 AND 999),
  CONSTRAINT chk_sirh_offres_salaire CHECK (
    (salaire_min IS NULL OR salaire_min >= 0) AND (salaire_max IS NULL OR salaire_max >= 0)
    AND (salaire_min IS NULL OR salaire_max IS NULL OR salaire_max >= salaire_min)
  ),
  CONSTRAINT chk_sirh_offres_dates CHECK (
    date_cloture IS NULL OR date_publication IS NULL OR date_cloture >= date_publication
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_offres_reference_actif
  ON sirh_offres (entreprise_id, reference) WHERE reference IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_offres_statut
  ON sirh_offres (entreprise_id, statut) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sirh_candidatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  offre_id UUID NOT NULL REFERENCES sirh_offres(id) ON DELETE RESTRICT,
  candidat_id UUID NOT NULL REFERENCES sirh_candidats(id) ON DELETE CASCADE,
  etape sirh_etape_candidature NOT NULL DEFAULT 'nouvelle',
  date_candidature DATE NOT NULL DEFAULT CURRENT_DATE,
  note INTEGER,
  motif_refus sirh_motif_refus,
  date_entretien TIMESTAMPTZ,
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_candidatures_note CHECK (note IS NULL OR note BETWEEN 1 AND 5),
  CONSTRAINT chk_sirh_candidatures_refus CHECK (motif_refus IS NULL OR etape = 'refusee')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_candidatures_actif
  ON sirh_candidatures (offre_id, candidat_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_candidatures_candidat
  ON sirh_candidatures (candidat_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_candidatures_etape
  ON sirh_candidatures (offre_id, etape) WHERE deleted_at IS NULL;

-- Avis des évaluateurs (Factorial ats/Feedback).
CREATE TABLE IF NOT EXISTS sirh_candidature_avis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  candidature_id UUID NOT NULL REFERENCES sirh_candidatures(id) ON DELETE CASCADE,
  auteur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  note INTEGER,
  avis sirh_avis_recrutement NOT NULL DEFAULT 'reserve',
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_candidature_avis_note CHECK (note IS NULL OR note BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS idx_sirh_candidature_avis_candidature
  ON sirh_candidature_avis (candidature_id) WHERE deleted_at IS NULL;

-- ── 10. Entretiens & performance (Factorial performance) ────────────────────
CREATE TABLE IF NOT EXISTS sirh_campagnes_entretiens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  libelle TEXT NOT NULL,
  type_entretien sirh_type_entretien NOT NULL DEFAULT 'annuel',
  date_debut DATE,
  date_limite DATE,
  statut sirh_statut_campagne NOT NULL DEFAULT 'brouillon',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_campagnes_dates CHECK (
    date_limite IS NULL OR date_debut IS NULL OR date_limite >= date_debut
  )
);

CREATE TABLE IF NOT EXISTS sirh_entretiens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  campagne_id UUID REFERENCES sirh_campagnes_entretiens(id) ON DELETE SET NULL,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  evaluateur_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  type_entretien sirh_type_entretien NOT NULL DEFAULT 'annuel',
  date_prevue DATE,
  date_realisation DATE,
  statut sirh_statut_entretien NOT NULL DEFAULT 'a_planifier',
  note_globale INTEGER,
  synthese TEXT,
  points_forts TEXT,
  axes_amelioration TEXT,
  souhaits_formation TEXT,
  souhaits_evolution TEXT,
  commentaire_salarie TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_entretiens_note CHECK (note_globale IS NULL OR note_globale BETWEEN 1 AND 5),
  CONSTRAINT chk_sirh_entretiens_realise CHECK (
    statut NOT IN ('realise','signe') OR date_realisation IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS idx_sirh_entretiens_employe
  ON sirh_entretiens (employe_id, date_realisation) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_entretiens_campagne
  ON sirh_entretiens (campagne_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_entretiens_campagne_employe
  ON sirh_entretiens (campagne_id, employe_id)
  WHERE campagne_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sirh_objectifs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  entretien_id UUID REFERENCES sirh_entretiens(id) ON DELETE SET NULL,
  libelle TEXT NOT NULL,
  description TEXT,
  date_echeance DATE,
  poids INTEGER,
  progression INTEGER NOT NULL DEFAULT 0,
  statut sirh_statut_objectif NOT NULL DEFAULT 'en_cours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_objectifs_poids CHECK (poids IS NULL OR poids BETWEEN 0 AND 100),
  CONSTRAINT chk_sirh_objectifs_progression CHECK (progression BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_sirh_objectifs_employe
  ON sirh_objectifs (employe_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_objectifs_entretien ON sirh_objectifs (entretien_id);

-- ── 11. Formation (Factorial trainings) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS sirh_formations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  code TEXT,
  intitule TEXT NOT NULL,
  categorie sirh_categorie_formation NOT NULL DEFAULT 'technique',
  organisme TEXT,
  modalite sirh_modalite_formation NOT NULL DEFAULT 'presentiel',
  duree_heures NUMERIC(6,2),
  cout_ht NUMERIC(12,2),
  obligatoire BOOLEAN NOT NULL DEFAULT false,
  -- Durée de validité de la qualification (recyclage), en mois. NULL = sans échéance.
  validite_mois INTEGER,
  description TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_formations_duree CHECK (duree_heures IS NULL OR duree_heures > 0),
  CONSTRAINT chk_sirh_formations_cout CHECK (cout_ht IS NULL OR cout_ht >= 0),
  CONSTRAINT chk_sirh_formations_validite CHECK (validite_mois IS NULL OR validite_mois BETWEEN 1 AND 240)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_formations_code_actif
  ON sirh_formations (entreprise_id, code) WHERE code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sirh_sessions_formation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  formation_id UUID NOT NULL REFERENCES sirh_formations(id) ON DELETE RESTRICT,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  lieu TEXT,
  formateur TEXT,
  places_max INTEGER,
  cout_ht NUMERIC(12,2),
  statut sirh_statut_session NOT NULL DEFAULT 'planifiee',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_sessions_dates CHECK (date_fin >= date_debut),
  CONSTRAINT chk_sirh_sessions_places CHECK (places_max IS NULL OR places_max > 0),
  CONSTRAINT chk_sirh_sessions_cout CHECK (cout_ht IS NULL OR cout_ht >= 0)
);
CREATE INDEX IF NOT EXISTS idx_sirh_sessions_formation
  ON sirh_sessions_formation (formation_id, date_debut) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sirh_inscriptions_formation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sirh_sessions_formation(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  statut sirh_statut_inscription NOT NULL DEFAULT 'inscrit',
  resultat sirh_resultat_formation NOT NULL DEFAULT 'non_evalue',
  heures_realisees NUMERIC(6,2),
  -- Échéance de la qualification obtenue (date de fin de session + validité).
  date_validite DATE,
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_inscriptions_heures CHECK (heures_realisees IS NULL OR heures_realisees >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_inscriptions_actif
  ON sirh_inscriptions_formation (session_id, employe_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_inscriptions_employe
  ON sirh_inscriptions_formation (employe_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_inscriptions_validite
  ON sirh_inscriptions_formation (entreprise_id, date_validite) WHERE deleted_at IS NULL;

-- ── 12. Onboarding / processus & tâches (Factorial processes + tasks) ───────
CREATE TABLE IF NOT EXISTS sirh_modeles_processus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  nom TEXT NOT NULL,
  type_processus sirh_type_processus NOT NULL DEFAULT 'onboarding',
  description TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_modeles_processus_nom_actif
  ON sirh_modeles_processus (entreprise_id, nom) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sirh_modele_taches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  modele_id UUID NOT NULL REFERENCES sirh_modeles_processus(id) ON DELETE CASCADE,
  libelle TEXT NOT NULL,
  description TEXT,
  responsable sirh_responsable_tache NOT NULL DEFAULT 'rh',
  -- Échéance relative à la date de référence du processus (négatif = avant l'arrivée).
  delai_jours INTEGER NOT NULL DEFAULT 0,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_modele_taches_delai CHECK (delai_jours BETWEEN -365 AND 365)
);
CREATE INDEX IF NOT EXISTS idx_sirh_modele_taches_modele
  ON sirh_modele_taches (modele_id, ordre) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sirh_processus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  modele_id UUID REFERENCES sirh_modeles_processus(id) ON DELETE SET NULL,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  type_processus sirh_type_processus NOT NULL DEFAULT 'onboarding',
  libelle TEXT NOT NULL,
  date_reference DATE NOT NULL,
  statut sirh_statut_processus NOT NULL DEFAULT 'en_cours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sirh_processus_employe
  ON sirh_processus (employe_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_processus_statut
  ON sirh_processus (entreprise_id, statut) WHERE deleted_at IS NULL;

-- Tâches RH (Factorial tasks/Task) — rattachées à un processus ou autonomes.
CREATE TABLE IF NOT EXISTS sirh_taches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  processus_id UUID REFERENCES sirh_processus(id) ON DELETE CASCADE,
  employe_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  libelle TEXT NOT NULL,
  description TEXT,
  responsable sirh_responsable_tache NOT NULL DEFAULT 'rh',
  assigne_a TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  echeance DATE,
  statut sirh_statut_tache NOT NULL DEFAULT 'a_faire',
  date_realisation DATE,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_taches_realisation CHECK (statut <> 'faite' OR date_realisation IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_sirh_taches_processus
  ON sirh_taches (processus_id, ordre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_taches_assigne
  ON sirh_taches (assigne_a, statut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_taches_echeance
  ON sirh_taches (entreprise_id, echeance) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_taches_employe
  ON sirh_taches (employe_id) WHERE deleted_at IS NULL;

-- ── 13. Matériel & dotations (Factorial it_management, étendu EPI/outillage) ─
CREATE TABLE IF NOT EXISTS sirh_materiels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  categorie sirh_categorie_materiel NOT NULL DEFAULT 'autre',
  libelle TEXT NOT NULL,
  marque TEXT,
  modele TEXT,
  numero_serie TEXT,
  taille TEXT,
  date_achat DATE,
  valeur_achat NUMERIC(12,2),
  date_fin_garantie DATE,
  -- Prochain contrôle périodique / date de péremption (EPI antichute, extincteur…).
  date_controle DATE,
  statut sirh_statut_materiel NOT NULL DEFAULT 'en_stock',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_materiels_valeur CHECK (valeur_achat IS NULL OR valeur_achat >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_materiels_serie_actif
  ON sirh_materiels (entreprise_id, numero_serie)
  WHERE numero_serie IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_materiels_statut
  ON sirh_materiels (entreprise_id, statut) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sirh_attributions_materiel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  materiel_id UUID NOT NULL REFERENCES sirh_materiels(id) ON DELETE CASCADE,
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  date_remise DATE NOT NULL,
  date_retour DATE,
  etat_remise TEXT,
  etat_retour TEXT,
  decharge_signee BOOLEAN NOT NULL DEFAULT false,
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_attributions_dates CHECK (date_retour IS NULL OR date_retour >= date_remise)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sirh_attributions_en_cours
  ON sirh_attributions_materiel (materiel_id) WHERE date_retour IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sirh_attributions_employe
  ON sirh_attributions_materiel (employe_id) WHERE deleted_at IS NULL;

-- ── 14. Communication interne (Factorial posts) ─────────────────────────────
CREATE TABLE IF NOT EXISTS sirh_annonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  titre TEXT NOT NULL,
  contenu TEXT NOT NULL,
  categorie sirh_categorie_annonce NOT NULL DEFAULT 'information',
  epinglee BOOLEAN NOT NULL DEFAULT false,
  publiee BOOLEAN NOT NULL DEFAULT true,
  date_publication DATE NOT NULL DEFAULT CURRENT_DATE,
  date_expiration DATE,
  auteur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  -- Audience : NULL = toute l'entreprise.
  site_id UUID REFERENCES sirh_sites(id) ON DELETE SET NULL,
  equipe_id UUID REFERENCES sirh_equipes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sirh_annonces_dates CHECK (
    date_expiration IS NULL OR date_expiration >= date_publication
  )
);
CREATE INDEX IF NOT EXISTS idx_sirh_annonces_publication
  ON sirh_annonces (entreprise_id, date_publication) WHERE deleted_at IS NULL;

-- ── 15. Triggers updated_at (toutes les tables) ─────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sirh_sites','sirh_postes','sirh_horaires','sirh_equipes','sirh_equipe_membres',
    'sirh_collaborateurs','sirh_contrats','sirh_periodes_paie','sirh_dossiers_documents',
    'sirh_candidats','sirh_documents','sirh_types_absence','sirh_compteurs',
    'sirh_compteur_ajustements','sirh_absences','sirh_periodes_bloquees','sirh_jours_feries',
    'sirh_badgeages','sirh_heures_sup','sirh_notes_frais','sirh_variables_paie','sirh_offres',
    'sirh_candidatures','sirh_candidature_avis','sirh_campagnes_entretiens','sirh_entretiens',
    'sirh_objectifs','sirh_formations','sirh_sessions_formation','sirh_inscriptions_formation',
    'sirh_modeles_processus','sirh_modele_taches','sirh_processus','sirh_taches',
    'sirh_materiels','sirh_attributions_materiel','sirh_annonces'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ── 16. Héritage entreprise_id depuis le parent (tables filles, cf. 0044) ───
-- Une FK parent NULL (optionnelle) laisse l'application fournir entreprise_id.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('sirh_equipe_membres',         'sirh_equipes',              'equipe_id'),
      ('sirh_collaborateurs',         'employes',                  'employe_id'),
      ('sirh_contrats',               'employes',                  'employe_id'),
      ('sirh_documents',              'employes',                  'employe_id'),
      ('sirh_compteurs',              'employes',                  'employe_id'),
      ('sirh_compteur_ajustements',   'sirh_compteurs',            'compteur_id'),
      ('sirh_absences',               'employes',                  'employe_id'),
      ('sirh_badgeages',              'employes',                  'employe_id'),
      ('sirh_heures_sup',             'employes',                  'employe_id'),
      ('sirh_notes_frais',            'employes',                  'employe_id'),
      ('sirh_variables_paie',         'sirh_periodes_paie',        'periode_id'),
      ('sirh_candidatures',           'sirh_offres',               'offre_id'),
      ('sirh_candidature_avis',       'sirh_candidatures',         'candidature_id'),
      ('sirh_entretiens',             'employes',                  'employe_id'),
      ('sirh_objectifs',              'employes',                  'employe_id'),
      ('sirh_sessions_formation',     'sirh_formations',           'formation_id'),
      ('sirh_inscriptions_formation', 'sirh_sessions_formation',   'session_id'),
      ('sirh_modele_taches',          'sirh_modeles_processus',    'modele_id'),
      ('sirh_processus',              'employes',                  'employe_id'),
      ('sirh_taches',                 'sirh_processus',            'processus_id'),
      ('sirh_attributions_materiel',  'sirh_materiels',            'materiel_id')
    ) AS t(enfant, parent, fk)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_%s ON %I', r.enfant, r.enfant);
    EXECUTE format(
      'CREATE TRIGGER trg_inherit_entreprise_id_%s BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id(%L, %L)',
      r.enfant, r.enfant, r.parent, r.fk
    );
  END LOOP;
END $$;

-- ── 17. RLS tenant (p_tenant) + GRANT app_rw (toutes les tables) ────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sirh_sites','sirh_postes','sirh_horaires','sirh_equipes','sirh_equipe_membres',
    'sirh_collaborateurs','sirh_contrats','sirh_periodes_paie','sirh_dossiers_documents',
    'sirh_candidats','sirh_documents','sirh_types_absence','sirh_compteurs',
    'sirh_compteur_ajustements','sirh_absences','sirh_periodes_bloquees','sirh_jours_feries',
    'sirh_badgeages','sirh_heures_sup','sirh_notes_frais','sirh_variables_paie','sirh_offres',
    'sirh_candidatures','sirh_candidature_avis','sirh_campagnes_entretiens','sirh_entretiens',
    'sirh_objectifs','sirh_formations','sirh_sessions_formation','sirh_inscriptions_formation',
    'sirh_modeles_processus','sirh_modele_taches','sirh_processus','sirh_taches',
    'sirh_materiels','sirh_attributions_materiel','sirh_annonces'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS p_tenant ON %I', t);
    EXECUTE format(
      'CREATE POLICY p_tenant ON %I AS PERMISSIVE FOR ALL TO app_rw '
      || 'USING (entreprise_id = current_setting(''app.current_entreprise_id'', true)::uuid) '
      || 'WITH CHECK (entreprise_id = current_setting(''app.current_entreprise_id'', true)::uuid)',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rw', t);
  END LOOP;
END $$;

COMMIT;
