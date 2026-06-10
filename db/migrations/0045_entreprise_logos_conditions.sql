-- 0045_entreprise_logos_conditions.sql
-- Objectif :
--   - Table entreprise_logos : logo principal + N "certifications" (RGE, Qualibat, ...)
--     destinés à apparaître sur devis/factures.
--   - Table entreprise_conditions : CGV / CGA versionnées (texte riche HTML),
--     avec historique conservé pour les documents déjà émis.
--
-- Multi-tenant : RLS activée + policy p_tenant pour app_rw, suivant la
-- convention posée par 0043_rls_policies.sql.
--
-- À appliquer en tant que app_migrator :
--   docker exec -i -e PGPASSWORD=app_migrator_dev_password erp-btp-postgres \
--     psql -U app_migrator -d erpbtp < db/migrations/0045_entreprise_logos_conditions.sql

BEGIN;

-- =================================================================
-- 1. Table entreprise_logos
-- =================================================================
-- type :
--   - 'principal'      : 1 seul actif par entreprise (logo société de référence)
--   - 'certification'  : 0..N, ordonnés via `ordre` (RGE, Qualibat, ...)

CREATE TABLE IF NOT EXISTS entreprise_logos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id  uuid NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  type           text NOT NULL,
  libelle        text NOT NULL,
  storage_key    text NOT NULL,
  mime_type      text NOT NULL,
  taille_octets  integer NOT NULL,
  largeur_px     integer,
  hauteur_px     integer,
  ordre          integer NOT NULL DEFAULT 0,
  actif          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT chk_entreprise_logos_type
    CHECK (type IN ('principal', 'certification')),
  CONSTRAINT chk_entreprise_logos_mime
    CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  CONSTRAINT chk_entreprise_logos_taille
    CHECK (taille_octets > 0 AND taille_octets <= 5 * 1024 * 1024)
);

-- Un seul logo "principal" actif (non supprimé) par entreprise
CREATE UNIQUE INDEX IF NOT EXISTS uq_entreprise_logo_principal
  ON entreprise_logos (entreprise_id)
  WHERE type = 'principal' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entreprise_logos_entreprise_type
  ON entreprise_logos (entreprise_id, type, ordre)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_entreprise_logos_updated_at ON entreprise_logos;
CREATE TRIGGER trg_entreprise_logos_updated_at
  BEFORE UPDATE ON entreprise_logos
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 2. Table entreprise_conditions (CGV / CGA versionnées)
-- =================================================================
-- type :
--   - 'cgv' : Conditions Générales de Vente
--   - 'cga' : Conditions Générales d'Achat
--
-- version : entier monotone croissant par (entreprise, type), généré côté app.
-- contenu_html : HTML produit par Tiptap (sanitizé côté serveur avant insertion).
-- contenu_json : représentation Tiptap (utile pour ré-édition sans perte).
-- date_effet : date d'application juridique de cette version.

CREATE TABLE IF NOT EXISTS entreprise_conditions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id  uuid NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  type           text NOT NULL,
  version        integer NOT NULL,
  contenu_html   text NOT NULL,
  contenu_json   jsonb,
  date_effet     date NOT NULL,
  commentaire    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at     timestamptz,
  CONSTRAINT chk_entreprise_conditions_type
    CHECK (type IN ('cgv', 'cga')),
  CONSTRAINT chk_entreprise_conditions_version_positif
    CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entreprise_conditions_version
  ON entreprise_conditions (entreprise_id, type, version)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_entreprise_conditions_actuelle
  ON entreprise_conditions (entreprise_id, type, date_effet DESC, version DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_entreprise_conditions_updated_at ON entreprise_conditions;
CREATE TRIGGER trg_entreprise_conditions_updated_at
  BEFORE UPDATE ON entreprise_conditions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 3. RLS — convention p_tenant (cf. 0043_rls_policies.sql)
-- =================================================================

ALTER TABLE entreprise_logos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE entreprise_logos       FORCE  ROW LEVEL SECURITY;
ALTER TABLE entreprise_conditions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE entreprise_conditions  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_tenant ON entreprise_logos;
CREATE POLICY p_tenant ON entreprise_logos
  AS PERMISSIVE FOR ALL TO app_rw
  USING       (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK  (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

DROP POLICY IF EXISTS p_tenant ON entreprise_conditions;
CREATE POLICY p_tenant ON entreprise_conditions
  AS PERMISSIVE FOR ALL TO app_rw
  USING       (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK  (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

-- =================================================================
-- 4. Grants (app_rw + app_admin)
-- =================================================================

GRANT SELECT, INSERT, UPDATE, DELETE
  ON entreprise_logos, entreprise_conditions
  TO app_rw, app_admin;

COMMIT;
