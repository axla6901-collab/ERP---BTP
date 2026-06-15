-- 0072_raisons_sociales.sql
-- Référentiel central des raisons sociales (noms légaux des entités externes).
--
-- ÉTAPE 1/2 (ADDITIVE — non destructive). Crée la table `raisons_sociales`
-- (tenant-scopée, RLS) puis ajoute une colonne NULLABLE `raison_sociale_id`
-- + FK + index sur clients / fournisseurs / sous_traitants / societes.
-- Les anciennes colonnes texte (clients.raison_sociale, societes.raison_sociale,
-- fournisseurs.nom, sous_traitants.nom) restent en place : aucune perte.
--
-- Ordre d'application :
--   1. 0072 (ce fichier)                         — DDL additive
--   2. pnpm tsx scripts/raisons-sociales-backfill.ts  — backfill cross-tenant
--      (rôle app_admin / BYPASSRLS ; app_migrator est soumis au RLS et ne
--       verrait aucune ligne tenant — cf. 0068)
--   3. 0073_raisons_sociales_swap.sql            — NOT NULL + drop colonnes texte
--
-- Rôle d'application : app_migrator. Idempotent.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Table référentiel
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raisons_sociales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  raison_sociale TEXT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_raisons_sociales_len CHECK (char_length(raison_sociale) BETWEEN 2 AND 200)
);

-- Anti-doublon : un nom par entreprise, insensible à la casse.
CREATE UNIQUE INDEX IF NOT EXISTS uq_raisons_sociales_nom_active
  ON raisons_sociales (entreprise_id, lower(raison_sociale))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_raisons_sociales_entreprise
  ON raisons_sociales (entreprise_id);

CREATE INDEX IF NOT EXISTS idx_raisons_sociales_actif
  ON raisons_sociales (actif) WHERE deleted_at IS NULL;

-- updated_at automatique (fonction posée en 0002).
DROP TRIGGER IF EXISTS trg_raisons_sociales_updated_at ON raisons_sociales;
CREATE TRIGGER trg_raisons_sociales_updated_at
  BEFORE UPDATE ON raisons_sociales
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- RLS tenant : même policy p_tenant que les autres tables scopées (cf. 0043).
ALTER TABLE raisons_sociales ENABLE ROW LEVEL SECURITY;
ALTER TABLE raisons_sociales FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON raisons_sociales;
CREATE POLICY p_tenant ON raisons_sociales
  AS PERMISSIVE
  FOR ALL
  TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON raisons_sociales TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON raisons_sociales TO app_admin;

-- ─────────────────────────────────────────────────────────────
-- 2. Colonnes FK NULLABLES + index + FK (idempotent)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE clients         ADD COLUMN IF NOT EXISTS raison_sociale_id UUID;
ALTER TABLE fournisseurs    ADD COLUMN IF NOT EXISTS raison_sociale_id UUID;
ALTER TABLE sous_traitants  ADD COLUMN IF NOT EXISTS raison_sociale_id UUID;
ALTER TABLE societes        ADD COLUMN IF NOT EXISTS raison_sociale_id UUID;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('clients',        'fk_clients_raison_sociale'),
      ('fournisseurs',   'fk_fournisseurs_raison_sociale'),
      ('sous_traitants', 'fk_sous_traitants_raison_sociale'),
      ('societes',       'fk_societes_raison_sociale')
    ) AS v(tbl, cons)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = r.cons
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (raison_sociale_id) '
        'REFERENCES raisons_sociales(id) ON DELETE RESTRICT',
        r.tbl, r.cons
      );
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_raison_sociale        ON clients        (raison_sociale_id);
CREATE INDEX IF NOT EXISTS idx_fournisseurs_raison_sociale   ON fournisseurs   (raison_sociale_id);
CREATE INDEX IF NOT EXISTS idx_sous_traitants_raison_sociale ON sous_traitants (raison_sociale_id);
CREATE INDEX IF NOT EXISTS idx_societes_raison_sociale       ON societes       (raison_sociale_id);

COMMIT;
