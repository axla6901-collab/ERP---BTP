-- 0037_entreprises_core.sql
-- Objectif : poser les fondations du multi-tenant.
--   - Table entreprises (tenant racine)
--   - Table utilisateur_entreprises (jointure many-to-many user <-> entreprise + rôle scopé)
--   - Flag is_super_admin sur utilisateurs (console de provisioning)
--   - Rôle DB app_admin BYPASSRLS pour les opérations cross-tenant
--   - Seed de l'entreprise « default » + migration des bindings existants
--
-- Référence : plan multi-tenant (ADR-015 à venir).
-- À appliquer en tant que app_migrator (BYPASSRLS implicite) :
--   docker exec -i -e PGPASSWORD=app_migrator_dev_password erp-btp-postgres \
--     psql -U app_migrator -d erpbtp < db/migrations/0037_entreprises_core.sql

BEGIN;

-- =================================================================
-- 1. Tables
-- =================================================================

CREATE TABLE IF NOT EXISTS entreprises (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL,
  raison_sociale  text NOT NULL,
  siret           text,
  tva_intracom    text,
  adresse_ligne1  text,
  adresse_ligne2  text,
  code_postal     text,
  ville           text,
  pays            text NOT NULL DEFAULT 'France',
  logo_url        text,
  actif           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  CONSTRAINT chk_entreprises_slug   CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  CONSTRAINT chk_entreprises_siret  CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$'),
  CONSTRAINT chk_entreprises_cp     CHECK (code_postal IS NULL OR code_postal ~ '^[0-9]{5}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entreprises_slug_active
  ON entreprises (slug) WHERE deleted_at IS NULL;

-- Trigger updated_at (utilise la fonction définie par 0002_updated_at_trigger.sql)
DROP TRIGGER IF EXISTS trg_entreprises_updated_at ON entreprises;
CREATE TRIGGER trg_entreprises_updated_at
  BEFORE UPDATE ON entreprises
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE IF NOT EXISTS utilisateur_entreprises (
  utilisateur_id  text NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  entreprise_id   uuid NOT NULL REFERENCES entreprises(id)  ON DELETE RESTRICT,
  role_id         uuid NOT NULL REFERENCES roles(id)        ON DELETE RESTRICT,
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  PRIMARY KEY (utilisateur_id, entreprise_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_entreprise_default
  ON utilisateur_entreprises (utilisateur_id)
  WHERE is_default AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_utilisateur_entreprises_entreprise
  ON utilisateur_entreprises (entreprise_id) WHERE deleted_at IS NULL;

-- =================================================================
-- 2. Flag super-admin sur utilisateurs
-- =================================================================

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- =================================================================
-- 3. Seed entreprise « default » + bindings depuis utilisateurs.role_id
-- =================================================================

DO $$
DECLARE
  v_entreprise_id uuid;
BEGIN
  -- Crée l'entreprise default si absente, sinon récupère son id
  SELECT id INTO v_entreprise_id FROM entreprises WHERE slug = 'default';

  IF v_entreprise_id IS NULL THEN
    INSERT INTO entreprises (slug, raison_sociale)
    VALUES ('default', 'Entreprise par défaut')
    RETURNING id INTO v_entreprise_id;
  END IF;

  -- Crée un binding utilisateur_entreprises pour chaque utilisateur actif
  -- en réutilisant son role_id actuel (la colonne reste pour compat M0).
  INSERT INTO utilisateur_entreprises (utilisateur_id, entreprise_id, role_id, is_default)
  SELECT u.id, v_entreprise_id, u.role_id, true
  FROM utilisateurs u
  WHERE u.deleted_at IS NULL
  ON CONFLICT (utilisateur_id, entreprise_id) DO NOTHING;
END $$;

-- =================================================================
-- 4. Rôle système super_admin (matrice RBAC)
--    Note : le contrôle d'accès super-admin runtime utilise le flag
--    utilisateurs.is_super_admin, ce rôle sert uniquement de marker
--    propre dans la matrice RBAC pour les opérations de provisioning.
-- =================================================================

INSERT INTO roles (code, libelle, description, systeme, actif)
VALUES (
  'super_admin',
  'Super administrateur',
  'Provisioning cross-tenant (création d''entreprises, audit global). Réservé à l''éditeur.',
  true,
  true
)
ON CONFLICT (code) DO NOTHING;

-- =================================================================
-- 5. Grants spécifiques aux nouvelles tables (app_rw + app_admin)
--    Le rôle app_admin doit avoir été créé au préalable par 0037a
--    (CREATE ROLE nécessite un superuser, donc une migration séparée
--     appliquée via erpbtp).
-- =================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON entreprises, utilisateur_entreprises
  TO app_rw, app_admin;

COMMIT;
