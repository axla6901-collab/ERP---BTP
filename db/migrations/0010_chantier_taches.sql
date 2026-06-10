-- 0010_chantier_taches.sql
-- M4.2 : tâches du chantier (liste à plat ordonnée + statut + avancement %).
-- Schéma TypeScript miroir : db/schema/chantiers.ts
-- ADR : 012-taches-chantier
-- Appliquée via app_migrator. Idempotente.

-- =================================================================
-- 1. Enum statut_tache
-- =================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_tache') THEN
    CREATE TYPE statut_tache AS ENUM ('a_faire', 'en_cours', 'bloque', 'termine', 'annule');
  END IF;
END $$;

-- =================================================================
-- 2. Table chantier_taches
-- =================================================================

CREATE TABLE IF NOT EXISTS chantier_taches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL DEFAULT 0,
  libelle TEXT NOT NULL,
  description TEXT,
  responsable_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  statut statut_tache NOT NULL DEFAULT 'a_faire',
  avancement_pourcent INTEGER NOT NULL DEFAULT 0,
  date_debut_prevue DATE,
  date_fin_prevue DATE,
  date_debut_reelle DATE,
  date_fin_reelle DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_chantier_taches_avancement CHECK (
    avancement_pourcent >= 0 AND avancement_pourcent <= 100
  ),
  CONSTRAINT chk_chantier_taches_dates_prevues CHECK (
    date_fin_prevue IS NULL OR date_debut_prevue IS NULL OR date_fin_prevue >= date_debut_prevue
  ),
  CONSTRAINT chk_chantier_taches_dates_reelles CHECK (
    date_fin_reelle IS NULL OR date_debut_reelle IS NULL OR date_fin_reelle >= date_debut_reelle
  )
);

CREATE INDEX IF NOT EXISTS idx_chantier_taches_chantier
  ON chantier_taches (chantier_id, ordre);
CREATE INDEX IF NOT EXISTS idx_chantier_taches_responsable
  ON chantier_taches (responsable_id);

DROP TRIGGER IF EXISTS trg_chantier_taches_updated_at ON chantier_taches;
CREATE TRIGGER trg_chantier_taches_updated_at
  BEFORE UPDATE ON chantier_taches
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- Tests de fumée
-- =================================================================
-- INSERT INTO chantier_taches (chantier_id, libelle)
--   VALUES ((SELECT id FROM chantiers LIMIT 1), 'Test tâche');
-- SELECT * FROM chantier_taches ORDER BY ordre;
