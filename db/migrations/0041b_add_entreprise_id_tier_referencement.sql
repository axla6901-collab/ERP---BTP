-- 0041b_add_entreprise_id_tier_referencement.sql
-- Ajout de entreprise_id sur le module Référencement Tiers (migrations 0028-0032) :
-- societes, tiers, corps_etat, natures_document + leurs tables filles / matrices.
--
-- nature_tiers_types_engagement (matrice ENUM × ENUM seedée par 0030) reste GLOBALE :
-- c'est un référentiel sectoriel BTP partagé entre toutes les entreprises (comme `unites`).
-- Si une entreprise veut customiser, on créera plus tard une table de surcharge per-tenant.
--
-- ⚠️ DÉFENSIVE : chaque opération est skippée si la table n'existe pas dans
-- l'environnement courant (migrations 0028-0032 non encore appliquées).
-- La migration peut être rejouée sans effet de bord après application des modules manquants.

BEGIN;

-- Helper : ADD COLUMN + UPDATE backfill_default + SET NOT NULL + CREATE INDEX
-- p_parent_table / p_parent_fk : si NULL, backfill avec entreprise default ;
-- sinon, backfill hérité du parent.
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

-- Application aux tables du module
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

DROP FUNCTION __scope_table_to_entreprise(TEXT, TEXT, TEXT);

COMMIT;
