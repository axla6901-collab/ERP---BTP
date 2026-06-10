-- 0011_rh_employes_pointages.sql
-- M5.1 + M5.2 : module RH — employés + pointages (saisie + matrice mensuelle).
-- Schémas TypeScript miroir : db/schema/employes.ts, db/schema/pointages.ts
-- ADR : 013-rh-pointage-socle
-- Appliquée via app_migrator. Idempotente.

-- =================================================================
-- 1. Enums M5
-- =================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_contrat') THEN
    CREATE TYPE type_contrat AS ENUM ('CDI', 'CDD', 'INT', 'ALT', 'STAGE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'zone_deplacement') THEN
    CREATE TYPE zone_deplacement AS ENUM ('Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'GD', 'GE');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_pointage') THEN
    CREATE TYPE type_pointage AS ENUM (
      'heures', 'absence', 'kg_acier_ha', 'kg_acier_ts', 'm3_beton_b16', 'm3_beton_b25'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'motif_absence') THEN
    CREATE TYPE motif_absence AS ENUM (
      'conges_payes', 'rtt', 'maladie', 'accident_travail', 'formation', 'jour_ferie', 'autre'
    );
  END IF;
END $$;

-- =================================================================
-- 2. Table employes
-- =================================================================

CREATE TABLE IF NOT EXISTS employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  type_contrat type_contrat NOT NULL DEFAULT 'CDI',
  societe_interim TEXT,
  qualification TEXT,
  taux_horaire_brut NUMERIC(8, 2),
  heures_hebdo_contractuelles NUMERIC(5, 2) NOT NULL DEFAULT 39,
  zone_deplacement_defaut zone_deplacement,
  date_entree DATE,
  date_sortie DATE,
  email TEXT,
  telephone TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  utilisateur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_employes_interim_societe CHECK (
    type_contrat <> 'INT' OR societe_interim IS NOT NULL
  ),
  CONSTRAINT chk_employes_dates CHECK (
    date_sortie IS NULL OR date_entree IS NULL OR date_sortie >= date_entree
  ),
  CONSTRAINT chk_employes_email CHECK (email IS NULL OR email ~ '@')
);

CREATE INDEX IF NOT EXISTS idx_employes_actif ON employes (actif);
CREATE INDEX IF NOT EXISTS idx_employes_type_contrat ON employes (type_contrat);

DROP TRIGGER IF EXISTS trg_employes_updated_at ON employes;
CREATE TRIGGER trg_employes_updated_at
  BEFORE UPDATE ON employes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 3. Activation FK utilisateurs.employe_id (placeholder existant → vraie FK)
-- =================================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_utilisateurs_employe'
  ) THEN
    ALTER TABLE utilisateurs
      ADD CONSTRAINT fk_utilisateurs_employe
        FOREIGN KEY (employe_id) REFERENCES employes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =================================================================
-- 4. Table pointages
-- =================================================================

CREATE TABLE IF NOT EXISTS pointages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employe_id UUID NOT NULL REFERENCES employes(id) ON DELETE RESTRICT,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE RESTRICT,
  chantier_tache_id UUID REFERENCES chantier_taches(id) ON DELETE SET NULL,
  date_pointage DATE NOT NULL,
  type type_pointage NOT NULL DEFAULT 'heures',
  quantite NUMERIC(7, 2) NOT NULL,
  motif_absence motif_absence,
  zone_deplacement zone_deplacement,
  panier BOOLEAN NOT NULL DEFAULT false,
  grand_panier BOOLEAN NOT NULL DEFAULT false,
  nuit_panier_soir BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_pointages_absence_coherence CHECK (
    (type = 'absence' AND chantier_id IS NULL AND motif_absence IS NOT NULL)
    OR (type <> 'absence' AND chantier_id IS NOT NULL AND motif_absence IS NULL)
  ),
  CONSTRAINT chk_pointages_quantite_positive CHECK (quantite > 0)
);

CREATE INDEX IF NOT EXISTS idx_pointages_employe_date
  ON pointages (employe_id, date_pointage DESC);
CREATE INDEX IF NOT EXISTS idx_pointages_chantier_date
  ON pointages (chantier_id, date_pointage DESC);
CREATE INDEX IF NOT EXISTS idx_pointages_date
  ON pointages (date_pointage DESC);

-- Unique partiel pour empêcher les doublons sur (employé, date, chantier, type).
-- COALESCE pour bien matcher quand chantier_id est NULL (absences).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pointages_employe_date_chantier_type
  ON pointages (employe_id, date_pointage, COALESCE(chantier_id, '00000000-0000-0000-0000-000000000000'::uuid), type)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_pointages_updated_at ON pointages;
CREATE TRIGGER trg_pointages_updated_at
  BEFORE UPDATE ON pointages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 5. Tests de fumée
-- =================================================================
-- INSERT INTO employes (nom, prenom, type_contrat) VALUES ('Dupont', 'Alice', 'CDI');
-- INSERT INTO employes (nom, prenom, type_contrat, societe_interim)
--   VALUES ('Martin', 'Bob', 'INT', 'Randstad');
-- INSERT INTO employes (nom, prenom, type_contrat) VALUES ('X', 'Y', 'INT');  -- doit échouer
