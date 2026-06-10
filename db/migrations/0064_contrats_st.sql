-- 0064_contrats_st.sql
-- M8.2 — Contrats de sous-traitance (CONTRAT_ST).
-- Schéma TypeScript miroir : db/schema/sous-traitance.ts (contratsSt).
-- Validation : lib/validation/contrat-st.ts.
--
-- Un contrat ST lie 1 sous-traitant (db/schema/tiers.ts) à 1 chantier, avec un
-- montant HT de marché et un taux de retenue de garantie figé (copié du ST à la
-- création — `lib/tiers/sous-traitants` → `taux_retenue_garantie`). Numéro
-- ST-<année>-000XXX via generate_numero('contrat_st', entreprise_id) (déjà câblé
-- en 0043/0057).
--
-- Multi-tenant : entreprise_id NOT NULL + RLS p_tenant (FORCE) + trigger
-- d'héritage depuis le sous-traitant (trg_inherit_entreprise_id, défini en 0044).
--
-- ⚠️ Numérotation : 0061/0062/0063 sont déjà occupés par d'autres chantiers
-- (facturx, pointage offline, prix courant, compte prorata). On poursuit en 0064.
--
-- ⚠️ Appliquer en superuser (erpbtp) : la création de POLICY / TRIGGER l'exige.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_contrat_st') THEN
    CREATE TYPE statut_contrat_st AS ENUM (
      'brouillon',  -- en cours de rédaction
      'actif',      -- signé / en cours d'exécution
      'suspendu',   -- suspendu (ex. documents périmés)
      'solde',      -- terminé / soldé
      'annule'      -- annulé
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS contrats_st (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  sous_traitant_id UUID NOT NULL REFERENCES sous_traitants(id) ON DELETE RESTRICT,
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE RESTRICT,
  numero TEXT NOT NULL,                       -- ST-2026-000004
  objet TEXT,
  montant_ht NUMERIC(14,2) NOT NULL DEFAULT 0,
  taux_retenue_garantie NUMERIC(5,2) NOT NULL DEFAULT 0,  -- figé (copié du ST)
  montant_retenue NUMERIC(14,2),              -- = montant_ht * taux/100 (figé en app)
  date_signature DATE,
  date_debut_prevue DATE,
  date_fin_prevue DATE,
  statut statut_contrat_st NOT NULL DEFAULT 'brouillon',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_contrats_st_montant CHECK (montant_ht >= 0),
  CONSTRAINT chk_contrats_st_retenue
    CHECK (taux_retenue_garantie >= 0 AND taux_retenue_garantie <= 10),
  CONSTRAINT chk_contrats_st_dates
    CHECK (date_fin_prevue IS NULL OR date_debut_prevue IS NULL OR date_fin_prevue >= date_debut_prevue)
);

-- Numéro unique par tenant (parmi les non-supprimés).
CREATE UNIQUE INDEX IF NOT EXISTS uq_contrats_st_entreprise_numero
  ON contrats_st (entreprise_id, numero) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contrats_st_entreprise ON contrats_st (entreprise_id);
CREATE INDEX IF NOT EXISTS idx_contrats_st_sous_traitant ON contrats_st (sous_traitant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contrats_st_chantier ON contrats_st (chantier_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contrats_st_statut ON contrats_st (statut) WHERE deleted_at IS NULL;

-- updated_at automatique (fonction trigger_set_updated_at définie en 0002).
DROP TRIGGER IF EXISTS trg_contrats_st_updated_at ON contrats_st;
CREATE TRIGGER trg_contrats_st_updated_at
  BEFORE UPDATE ON contrats_st
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Héritage entreprise_id depuis le sous-traitant (trg_inherit_entreprise_id : 0044).
DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_contrats_st ON contrats_st;
CREATE TRIGGER trg_inherit_entreprise_id_contrats_st
  BEFORE INSERT ON contrats_st
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('sous_traitants', 'sous_traitant_id');

-- RLS tenant (fail-closed via GUC app.current_entreprise_id).
ALTER TABLE contrats_st ENABLE ROW LEVEL SECURITY;
ALTER TABLE contrats_st FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON contrats_st;
CREATE POLICY p_tenant ON contrats_st
  AS PERMISSIVE FOR ALL TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

COMMIT;
