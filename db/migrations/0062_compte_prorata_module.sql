-- 0062_compte_prorata_module.sql
-- Module Compte prorata (BTP, norme NF P03-001) :
--   * Feature flag `entreprises.compte_prorata_active` (option par entreprise).
--   * 4 tables tenant : compte_prorata (paramètres, 1 par chantier),
--     compte_prorata_participants (lots/intervenants + montant de marché,
--     clé de répartition), compte_prorata_depenses (dépenses communes — chaque
--     dépense est une avance de son payeur), compte_prorata_arretes (snapshot
--     immuable de l'arrêté de compte).
--   * Répartition au prorata du montant de marché HT, avec surcharge manuelle
--     possible d'un % par participant. Solde par participant = quote-part due
--     − dépenses avancées.
-- Triggers réutilisés : trigger_set_updated_at (0002), trg_inherit_entreprise_id (0044).
-- RLS p_tenant aligné sur les autres tables scopées (cf. 0043 / 0053).
-- Migration idempotente. À appliquer en tant que app_migrator.

BEGIN;

-- ── 1. Feature flag compte prorata par entreprise ───────────────────────────
ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS compte_prorata_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN entreprises.compte_prorata_active IS
  'Active le module Compte prorata (NF P03-001). Basculable par l''admin tenant.';

-- ── 2. Enum statut du compte ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE statut_compte_prorata AS ENUM ('ouvert', 'cloture', 'arrete');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── 3. Table compte_prorata (paramètres, 1 par chantier) ────────────────────
CREATE TABLE IF NOT EXISTS compte_prorata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE RESTRICT,
  base_repartition TEXT NOT NULL DEFAULT 'montant_marche_ht',
  frais_gestion_pct NUMERIC(5,2),
  statut statut_compte_prorata NOT NULL DEFAULT 'ouvert',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_compte_prorata_frais_pct
    CHECK (frais_gestion_pct IS NULL OR (frais_gestion_pct >= 0 AND frais_gestion_pct <= 100))
);

-- Un seul compte prorata actif par chantier.
CREATE UNIQUE INDEX IF NOT EXISTS uq_compte_prorata_chantier_actif
  ON compte_prorata (chantier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_compte_prorata_entreprise
  ON compte_prorata (entreprise_id);

-- ── 4. Table compte_prorata_participants (lots / intervenants) ──────────────
CREATE TABLE IF NOT EXISTS compte_prorata_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  compte_prorata_id UUID NOT NULL REFERENCES compte_prorata(id) ON DELETE CASCADE,
  sous_traitant_id UUID REFERENCES sous_traitants(id) ON DELETE RESTRICT,
  libelle TEXT NOT NULL,
  montant_marche_ht NUMERIC(14,2) NOT NULL DEFAULT 0,
  quote_part_pct_manuel NUMERIC(5,2),
  est_gestionnaire BOOLEAN NOT NULL DEFAULT false,
  ordre INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_cpp_montant_marche_pos CHECK (montant_marche_ht >= 0),
  CONSTRAINT chk_cpp_quote_part_pct
    CHECK (quote_part_pct_manuel IS NULL OR (quote_part_pct_manuel >= 0 AND quote_part_pct_manuel <= 100))
);

CREATE INDEX IF NOT EXISTS idx_cpp_compte
  ON compte_prorata_participants (compte_prorata_id, ordre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cpp_sous_traitant
  ON compte_prorata_participants (sous_traitant_id);
CREATE INDEX IF NOT EXISTS idx_cpp_entreprise
  ON compte_prorata_participants (entreprise_id);
-- Pas deux fois le même sous-traitant dans un même compte.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpp_compte_st_actif
  ON compte_prorata_participants (compte_prorata_id, sous_traitant_id)
  WHERE sous_traitant_id IS NOT NULL AND deleted_at IS NULL;
-- Un seul gestionnaire/pilote actif par compte.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpp_gestionnaire_actif
  ON compte_prorata_participants (compte_prorata_id)
  WHERE est_gestionnaire = true AND deleted_at IS NULL;

-- ── 5. Table compte_prorata_depenses (dépenses communes + qui a avancé) ─────
CREATE TABLE IF NOT EXISTS compte_prorata_depenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  compte_prorata_id UUID NOT NULL REFERENCES compte_prorata(id) ON DELETE CASCADE,
  avance_par_participant_id UUID NOT NULL
    REFERENCES compte_prorata_participants(id) ON DELETE RESTRICT,
  date_depense DATE NOT NULL,
  libelle TEXT NOT NULL,
  categorie TEXT,
  montant_ht NUMERIC(14,2) NOT NULL,
  piece_justificative_key TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_cpd_montant_pos CHECK (montant_ht > 0)
);

CREATE INDEX IF NOT EXISTS idx_cpd_compte
  ON compte_prorata_depenses (compte_prorata_id, date_depense) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cpd_avance_par
  ON compte_prorata_depenses (avance_par_participant_id);
CREATE INDEX IF NOT EXISTS idx_cpd_entreprise
  ON compte_prorata_depenses (entreprise_id);

-- ── 6. Table compte_prorata_arretes (snapshot immuable de l'arrêté) ─────────
CREATE TABLE IF NOT EXISTS compte_prorata_arretes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  compte_prorata_id UUID NOT NULL REFERENCES compte_prorata(id) ON DELETE CASCADE,
  numero INTEGER NOT NULL,
  date_arrete DATE NOT NULL,
  total_depenses_ht NUMERIC(14,2) NOT NULL,
  total_marche_ht NUMERIC(14,2) NOT NULL,
  frais_gestion_montant NUMERIC(14,2) NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cpa_compte_numero
  ON compte_prorata_arretes (compte_prorata_id, numero);
CREATE INDEX IF NOT EXISTS idx_cpa_compte
  ON compte_prorata_arretes (compte_prorata_id);
CREATE INDEX IF NOT EXISTS idx_cpa_entreprise
  ON compte_prorata_arretes (entreprise_id);

-- ── 7. Commentaires sur colonnes non triviales ──────────────────────────────
COMMENT ON COLUMN compte_prorata.frais_gestion_pct IS
  'Frais de gestion du compte (% des dépenses), mutualisés dans la base répartie.';
COMMENT ON COLUMN compte_prorata_participants.quote_part_pct_manuel IS
  'Surcharge manuelle de quote-part (prioritaire sur le prorata du marché).';
COMMENT ON COLUMN compte_prorata_participants.est_gestionnaire IS
  'Pilote/gestionnaire du compte prorata (un seul actif par compte).';
COMMENT ON COLUMN compte_prorata_depenses.avance_par_participant_id IS
  'Participant qui a engagé/avancé la dépense (base du calcul des soldes).';
COMMENT ON COLUMN compte_prorata_arretes.snapshot IS
  'Bilan figé (BilanCompteProrata sérialisé) au moment de l''arrêté de compte.';

-- ── 8. Triggers updated_at (fn 0002) ────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_compte_prorata_updated_at ON compte_prorata;
CREATE TRIGGER trg_compte_prorata_updated_at
  BEFORE UPDATE ON compte_prorata
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_compte_prorata_participants_updated_at ON compte_prorata_participants;
CREATE TRIGGER trg_compte_prorata_participants_updated_at
  BEFORE UPDATE ON compte_prorata_participants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_compte_prorata_depenses_updated_at ON compte_prorata_depenses;
CREATE TRIGGER trg_compte_prorata_depenses_updated_at
  BEFORE UPDATE ON compte_prorata_depenses
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_compte_prorata_arretes_updated_at ON compte_prorata_arretes;
CREATE TRIGGER trg_compte_prorata_arretes_updated_at
  BEFORE UPDATE ON compte_prorata_arretes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ── 9. Triggers d'héritage entreprise_id (fn 0044) ──────────────────────────
DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_compte_prorata ON compte_prorata;
CREATE TRIGGER trg_inherit_entreprise_id_compte_prorata
  BEFORE INSERT ON compte_prorata
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('chantiers', 'chantier_id');

DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_compte_prorata_participants ON compte_prorata_participants;
CREATE TRIGGER trg_inherit_entreprise_id_compte_prorata_participants
  BEFORE INSERT ON compte_prorata_participants
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('compte_prorata', 'compte_prorata_id');

DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_compte_prorata_depenses ON compte_prorata_depenses;
CREATE TRIGGER trg_inherit_entreprise_id_compte_prorata_depenses
  BEFORE INSERT ON compte_prorata_depenses
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('compte_prorata', 'compte_prorata_id');

DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_compte_prorata_arretes ON compte_prorata_arretes;
CREATE TRIGGER trg_inherit_entreprise_id_compte_prorata_arretes
  BEFORE INSERT ON compte_prorata_arretes
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('compte_prorata', 'compte_prorata_id');

-- ── 10. RLS tenant : policy p_tenant sur les 4 tables (cf. 0043) ────────────
ALTER TABLE compte_prorata ENABLE ROW LEVEL SECURITY;
ALTER TABLE compte_prorata FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON compte_prorata;
CREATE POLICY p_tenant ON compte_prorata
  AS PERMISSIVE FOR ALL TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON compte_prorata TO app_rw;

ALTER TABLE compte_prorata_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE compte_prorata_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON compte_prorata_participants;
CREATE POLICY p_tenant ON compte_prorata_participants
  AS PERMISSIVE FOR ALL TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON compte_prorata_participants TO app_rw;

ALTER TABLE compte_prorata_depenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE compte_prorata_depenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON compte_prorata_depenses;
CREATE POLICY p_tenant ON compte_prorata_depenses
  AS PERMISSIVE FOR ALL TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON compte_prorata_depenses TO app_rw;

ALTER TABLE compte_prorata_arretes ENABLE ROW LEVEL SECURITY;
ALTER TABLE compte_prorata_arretes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON compte_prorata_arretes;
CREATE POLICY p_tenant ON compte_prorata_arretes
  AS PERMISSIVE FOR ALL TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON compte_prorata_arretes TO app_rw;

COMMIT;
