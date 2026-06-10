-- 0013_employe_dossier_complet.sql
-- M5.4 : enrichissement du dossier employé (identité, contact, contrat, paie,
-- médical, carte BTP) + 3 tables séparées pour habilitations, permis, documents.
-- Schémas TypeScript miroir : db/schema/employes.ts (étendu)
-- ADR : 014-dossier-employe-complet
-- Appliquée via app_migrator. Idempotente.

-- =================================================================
-- 1. Nouveaux enums M5.4
-- =================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sexe_employe') THEN
    CREATE TYPE sexe_employe AS ENUM ('M', 'F', 'NB');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'situation_familiale') THEN
    CREATE TYPE situation_familiale AS ENUM (
      'celibataire', 'marie', 'pacse', 'divorce', 'veuf', 'concubinage'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'classification_employe') THEN
    CREATE TYPE classification_employe AS ENUM ('ouvrier', 'etam', 'cadre', 'apprenti');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'aptitude_medicale') THEN
    CREATE TYPE aptitude_medicale AS ENUM (
      'apte', 'apte_amenagement', 'inapte_temporaire', 'inapte'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_habilitation') THEN
    CREATE TYPE type_habilitation AS ENUM (
      'caces_r482_a', 'caces_r482_b', 'caces_r482_c', 'caces_r482_d',
      'caces_r482_e', 'caces_r482_f', 'caces_r482_g',
      'caces_r489_1a', 'caces_r489_1b', 'caces_r489_3', 'caces_r489_5', 'caces_r489_6',
      'aipr_concepteur', 'aipr_encadrant', 'aipr_operateur',
      'habilitation_b0', 'habilitation_be_manoeuvre', 'habilitation_b1v',
      'habilitation_b2v', 'habilitation_br', 'habilitation_bc', 'habilitation_hf',
      'secouriste_sst', 'autre'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'categorie_permis') THEN
    CREATE TYPE categorie_permis AS ENUM (
      'B', 'BE', 'C', 'C1', 'C1E', 'CE', 'D', 'D1', 'D1E', 'DE'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_document_employe') THEN
    CREATE TYPE type_document_employe AS ENUM (
      'cv', 'photo', 'contrat', 'attestation_pole_emploi', 'attestation_employeur',
      'carte_identite', 'passeport', 'titre_sejour', 'justificatif_domicile',
      'rib', 'carte_vitale', 'carte_btp', 'diplome', 'certificat_medical', 'autre'
    );
  END IF;
END $$;

-- =================================================================
-- 2. Renommer telephone → telephone_fixe et ajouter telephone_mobile
-- =================================================================
-- (chaîne préservée : la valeur actuelle de "telephone" devient telephone_mobile
-- par défaut, plus probable pour un employé)

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employes' AND column_name='telephone')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employes' AND column_name='telephone_mobile')
  THEN
    ALTER TABLE employes RENAME COLUMN telephone TO telephone_mobile;
  END IF;
END $$;

ALTER TABLE employes ADD COLUMN IF NOT EXISTS telephone_fixe TEXT;

-- =================================================================
-- 3. Ajout des nouvelles colonnes employes
-- =================================================================

-- Identité civile
ALTER TABLE employes ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS lieu_naissance TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS nationalite TEXT NOT NULL DEFAULT 'Française';
ALTER TABLE employes ADD COLUMN IF NOT EXISTS numero_secu TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS sexe sexe_employe;

-- Adresse perso
ALTER TABLE employes ADD COLUMN IF NOT EXISTS adresse_ligne1 TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS adresse_ligne2 TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS code_postal TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS pays TEXT NOT NULL DEFAULT 'France';

-- Contact urgence
ALTER TABLE employes ADD COLUMN IF NOT EXISTS contact_urgence_nom TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS contact_urgence_telephone TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS contact_urgence_relation TEXT;

-- Famille
ALTER TABLE employes ADD COLUMN IF NOT EXISTS situation_familiale situation_familiale;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS nombre_enfants INTEGER NOT NULL DEFAULT 0;

-- Contrat avancé
ALTER TABLE employes ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS date_embauche DATE;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS date_fin_contrat DATE;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS coefficient_hierarchique TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS classification classification_employe;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS salaire_mensuel_brut NUMERIC(10, 2);
ALTER TABLE employes ADD COLUMN IF NOT EXISTS convention_collective TEXT DEFAULT 'Bâtiment';

-- Banque
ALTER TABLE employes ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS bic TEXT;

-- Médical
ALTER TABLE employes ADD COLUMN IF NOT EXISTS date_derniere_visite_medicale DATE;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS date_prochaine_visite_medicale DATE;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS aptitude aptitude_medicale;

-- Carte BTP
ALTER TABLE employes ADD COLUMN IF NOT EXISTS numero_carte_btp TEXT;
ALTER TABLE employes ADD COLUMN IF NOT EXISTS date_validite_carte_btp DATE;

-- CHECK constraints (créés s'ils n'existent pas déjà)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_employes_numero_secu') THEN
    ALTER TABLE employes ADD CONSTRAINT chk_employes_numero_secu
      CHECK (numero_secu IS NULL OR numero_secu ~ '^[0-9]{13,15}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_employes_code_postal') THEN
    ALTER TABLE employes ADD CONSTRAINT chk_employes_code_postal
      CHECK (code_postal IS NULL OR code_postal ~ '^[0-9]{5}$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_employes_nombre_enfants') THEN
    ALTER TABLE employes ADD CONSTRAINT chk_employes_nombre_enfants
      CHECK (nombre_enfants >= 0 AND nombre_enfants <= 20);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_employes_iban_format') THEN
    ALTER TABLE employes ADD CONSTRAINT chk_employes_iban_format
      CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$');
  END IF;
END $$;

-- Unique partiel sur matricule
CREATE UNIQUE INDEX IF NOT EXISTS uq_employes_matricule_active
  ON employes (matricule) WHERE deleted_at IS NULL AND matricule IS NOT NULL;

-- =================================================================
-- 4. Table employe_habilitations
-- =================================================================

CREATE TABLE IF NOT EXISTS employe_habilitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  type type_habilitation NOT NULL,
  date_obtention DATE,
  date_validite DATE,
  numero TEXT,
  organisme TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_employe_habilitations_dates CHECK (
    date_validite IS NULL OR date_obtention IS NULL OR date_validite >= date_obtention
  )
);

CREATE INDEX IF NOT EXISTS idx_employe_habilitations_employe
  ON employe_habilitations (employe_id);
CREATE INDEX IF NOT EXISTS idx_employe_habilitations_validite
  ON employe_habilitations (date_validite) WHERE date_validite IS NOT NULL;

DROP TRIGGER IF EXISTS trg_employe_habilitations_updated_at ON employe_habilitations;
CREATE TRIGGER trg_employe_habilitations_updated_at
  BEFORE UPDATE ON employe_habilitations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 5. Table employe_permis
-- =================================================================

CREATE TABLE IF NOT EXISTS employe_permis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  categorie categorie_permis NOT NULL,
  date_obtention DATE,
  date_validite DATE,
  numero_permis TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_employe_permis_dates CHECK (
    date_validite IS NULL OR date_obtention IS NULL OR date_validite >= date_obtention
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employe_permis_unique
  ON employe_permis (employe_id, categorie) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_employe_permis_validite
  ON employe_permis (date_validite) WHERE date_validite IS NOT NULL;

DROP TRIGGER IF EXISTS trg_employe_permis_updated_at ON employe_permis;
CREATE TRIGGER trg_employe_permis_updated_at
  BEFORE UPDATE ON employe_permis
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 6. Table employe_documents
-- =================================================================

CREATE TABLE IF NOT EXISTS employe_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  type type_document_employe NOT NULL,
  libelle TEXT NOT NULL,
  minio_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  taille_bytes BIGINT,
  date_validite DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_employe_documents_taille CHECK (taille_bytes IS NULL OR taille_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_employe_documents_employe
  ON employe_documents (employe_id);
CREATE INDEX IF NOT EXISTS idx_employe_documents_validite
  ON employe_documents (date_validite) WHERE date_validite IS NOT NULL;

DROP TRIGGER IF EXISTS trg_employe_documents_updated_at ON employe_documents;
CREATE TRIGGER trg_employe_documents_updated_at
  BEFORE UPDATE ON employe_documents
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
