-- 0053_planning_module.sql
-- Module Planning (Gantt) :
--   * Feature flag `entreprises.planning_active` (option par entreprise).
--   * Extensions de `chantier_taches` pour le rendu Gantt fidèle à la maquette :
--       niveau, corps_metier, heures_planifiees, est_jalon, predecesseur_id.
--     `predecesseur_id` est volontairement nullable (une seule dépendance par tâche,
--     comme le champ `dep` de la maquette). Pas de chemin critique calculé.
--   * Nouvelle table `chantier_tache_equipe` (ouvriers affectés à une tâche
--     + heures prévues/faites), pour les KPI heures du planning.
-- Triggers réutilisés : trigger_set_updated_at (0002), trg_inherit_entreprise_id (0044).
-- RLS p_tenant aligné sur les autres tables scopées (cf. 0043).
-- Migration idempotente.

BEGIN;

-- ── 1. Feature flag planning par entreprise ─────────────────────────────────
ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS planning_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN entreprises.planning_active IS
  'Active le module Planning (Gantt chantier). Basculable par l''admin tenant.';

-- ── 2. Extensions chantier_taches (Gantt-friendly) ──────────────────────────
ALTER TABLE chantier_taches
  ADD COLUMN IF NOT EXISTS niveau TEXT,
  ADD COLUMN IF NOT EXISTS corps_metier TEXT,
  ADD COLUMN IF NOT EXISTS heures_planifiees INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS est_jalon BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS predecesseur_id UUID
    REFERENCES chantier_taches(id) ON DELETE SET NULL;

-- Garde-fous métier sur les nouvelles colonnes
ALTER TABLE chantier_taches
  DROP CONSTRAINT IF EXISTS chk_chantier_taches_heures_pos;
ALTER TABLE chantier_taches
  ADD CONSTRAINT chk_chantier_taches_heures_pos
  CHECK (heures_planifiees >= 0);

-- Pas d'auto-prédécesseur
ALTER TABLE chantier_taches
  DROP CONSTRAINT IF EXISTS chk_chantier_taches_pred_no_self;
ALTER TABLE chantier_taches
  ADD CONSTRAINT chk_chantier_taches_pred_no_self
  CHECK (predecesseur_id IS NULL OR predecesseur_id <> id);

-- Jalon : start = end (cohérence avec la maquette)
ALTER TABLE chantier_taches
  DROP CONSTRAINT IF EXISTS chk_chantier_taches_jalon_dates;
ALTER TABLE chantier_taches
  ADD CONSTRAINT chk_chantier_taches_jalon_dates
  CHECK (
    est_jalon = false
    OR date_debut_prevue IS NULL
    OR date_fin_prevue IS NULL
    OR date_debut_prevue = date_fin_prevue
  );

-- Index pour la lecture du planning regroupée par niveau / métier
CREATE INDEX IF NOT EXISTS idx_chantier_taches_niveau
  ON chantier_taches (chantier_id, niveau) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chantier_taches_metier
  ON chantier_taches (chantier_id, corps_metier) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chantier_taches_predecesseur
  ON chantier_taches (predecesseur_id) WHERE predecesseur_id IS NOT NULL;

-- ── 3. Affectation ouvriers (équipe) + heures par tâche ────────────────────
CREATE TABLE IF NOT EXISTS chantier_tache_equipe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  tache_id UUID NOT NULL REFERENCES chantier_taches(id) ON DELETE CASCADE,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE RESTRICT,
  heures_prevues INTEGER NOT NULL DEFAULT 0,
  heures_faites INTEGER NOT NULL DEFAULT 0,
  ordre INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_chantier_tache_equipe_heures_pos
    CHECK (heures_prevues >= 0 AND heures_faites >= 0)
);

-- Une seule affectation active par (tâche, ouvrier) — anti-doublon, comme la
-- maquette (cf. dwAddBtn).
CREATE UNIQUE INDEX IF NOT EXISTS uq_chantier_tache_equipe_actif
  ON chantier_tache_equipe (tache_id, utilisateur_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chantier_tache_equipe_tache
  ON chantier_tache_equipe (tache_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chantier_tache_equipe_entreprise
  ON chantier_tache_equipe (entreprise_id);

-- updated_at automatique
DROP TRIGGER IF EXISTS trg_chantier_tache_equipe_updated_at ON chantier_tache_equipe;
CREATE TRIGGER trg_chantier_tache_equipe_updated_at
  BEFORE UPDATE ON chantier_tache_equipe
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Hérite/contrôle entreprise_id depuis la tâche parente (cf. 0044)
DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_chantier_tache_equipe ON chantier_tache_equipe;
CREATE TRIGGER trg_inherit_entreprise_id_chantier_tache_equipe
  BEFORE INSERT ON chantier_tache_equipe
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('chantier_taches', 'tache_id');

-- RLS tenant : même policy p_tenant que les autres tables scopées (cf. 0043).
ALTER TABLE chantier_tache_equipe ENABLE ROW LEVEL SECURITY;
ALTER TABLE chantier_tache_equipe FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON chantier_tache_equipe;
CREATE POLICY p_tenant ON chantier_tache_equipe
  AS PERMISSIVE
  FOR ALL
  TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON chantier_tache_equipe TO app_rw;

COMMIT;
