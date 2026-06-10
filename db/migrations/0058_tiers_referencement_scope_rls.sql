-- 0058_tiers_referencement_scope_rls.sql
-- Finalise la mise en ligne du module Référencement Tiers (migrations 0028-0033) :
--   1. Ajoute entreprise_id (NOT NULL + index) aux 10 tables tenant du module.
--   2. Active RLS (ENABLE + FORCE + policy p_tenant) sur ces tables.
--
-- Contexte : les migrations 0041b (scope) et 0043 (RLS) étaient DÉFENSIVES et ont
-- SAUTÉ ces tables car elles n'existaient pas encore au moment où elles ont tourné.
-- Cette migration ré-applique le scope + RLS UNIQUEMENT aux tables du module, en
-- reprenant à l'identique le patron de 0041b / 0043. Idempotente.
--
-- nature_tiers_types_engagement reste GLOBALE (référentiel sectoriel partagé, comme
-- `unites`) : pas d'entreprise_id, pas de RLS.

BEGIN;

-- =================================================================
-- 1. Helper de scope : ADD COLUMN + backfill + NOT NULL + index
--    (repris de 0041b ; backfill hérité du parent ou entreprise 'default')
-- =================================================================

CREATE OR REPLACE FUNCTION __scope_table_to_entreprise(
  p_table       TEXT,
  p_parent      TEXT DEFAULT NULL,
  p_parent_fk   TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $fn$
DECLARE
  v_default_id uuid;
BEGIN
  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RAISE NOTICE 'Table % introuvable, skip scoping', p_table;
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %I ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT',
    p_table
  );

  IF p_parent IS NULL THEN
    SELECT id INTO v_default_id FROM entreprises WHERE slug = 'default';
    EXECUTE format(
      'UPDATE %I SET entreprise_id = $1 WHERE entreprise_id IS NULL', p_table
    ) USING v_default_id;
  ELSE
    EXECUTE format(
      'UPDATE %1$I c SET entreprise_id = p.entreprise_id FROM %2$I p WHERE c.%3$I = p.id AND c.entreprise_id IS NULL',
      p_table, p_parent, p_parent_fk
    );
  END IF;

  EXECUTE format('ALTER TABLE %I ALTER COLUMN entreprise_id SET NOT NULL', p_table);
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_%1$s_entreprise ON %1$I (entreprise_id)',
    p_table
  );
END $fn$;

-- =================================================================
-- 2. Helper RLS : ENABLE + FORCE + policy p_tenant pour app_rw
--    (repris de 0043, idempotent via DROP POLICY IF EXISTS)
-- =================================================================

CREATE OR REPLACE FUNCTION __enable_rls_tenant(p_table TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RAISE NOTICE 'Table % introuvable, skip RLS', p_table;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS p_tenant ON %I', p_table);
  EXECUTE format($f$
    CREATE POLICY p_tenant ON %I
      AS PERMISSIVE
      FOR ALL
      TO app_rw
      USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
      WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  $f$, p_table);
END $$;

-- =================================================================
-- 3. Scope entreprise_id (ordre : parents d'abord pour le backfill hérité)
-- =================================================================

SELECT __scope_table_to_entreprise('societes');
SELECT __scope_table_to_entreprise('tiers');
SELECT __scope_table_to_entreprise('corps_etat');
SELECT __scope_table_to_entreprise('natures_document');
SELECT __scope_table_to_entreprise('societes_regles',             'societes',         'societe_id');
SELECT __scope_table_to_entreprise('tier_corps_etat',             'tiers',            'tier_id');
SELECT __scope_table_to_entreprise('tier_societes_autorisees',    'tiers',            'tier_id');
SELECT __scope_table_to_entreprise('corps_etat_documents_requis', 'corps_etat',       'corps_etat_id');
SELECT __scope_table_to_entreprise('tier_documents',              'tiers',            'tier_id');
SELECT __scope_table_to_entreprise('tier_agrement_relances',      'tiers',            'tier_id');

-- =================================================================
-- 4. RLS
-- =================================================================

SELECT __enable_rls_tenant('societes');
SELECT __enable_rls_tenant('tiers');
SELECT __enable_rls_tenant('corps_etat');
SELECT __enable_rls_tenant('natures_document');
SELECT __enable_rls_tenant('societes_regles');
SELECT __enable_rls_tenant('tier_corps_etat');
SELECT __enable_rls_tenant('tier_societes_autorisees');
SELECT __enable_rls_tenant('corps_etat_documents_requis');
SELECT __enable_rls_tenant('tier_documents');
SELECT __enable_rls_tenant('tier_agrement_relances');

-- =================================================================
-- 5. Cleanup des helpers temporaires
-- =================================================================

DROP FUNCTION __scope_table_to_entreprise(TEXT, TEXT, TEXT);
DROP FUNCTION __enable_rls_tenant(TEXT);

COMMIT;
