-- 0044_inheritance_triggers.sql
-- Triggers BEFORE INSERT qui propagent entreprise_id depuis le parent
-- vers les tables filles (et vérifient la cohérence si entreprise_id est fourni).
--
-- Objectif : robustesse contre les bugs applicatifs. La RLS empêche déjà
-- d'INSERT une ligne avec un entreprise_id différent du tenant courant,
-- mais sans ce trigger une ligne fille pourrait être insérée avec un
-- entreprise_id incohérent avec celui de son parent (si le parent appartient
-- à un autre tenant — ne devrait pas arriver mais double-check).

BEGIN;

-- =================================================================
-- 1. Fonction trigger générique paramétrée
-- =================================================================
-- Arguments TG_ARGV : [parent_table, parent_fk_column].
-- Lit la valeur de la FK dans NEW via to_jsonb (technique pour récupérer
-- une colonne dont le nom est dynamique en PL/pgSQL).

CREATE OR REPLACE FUNCTION trg_inherit_entreprise_id() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent_table  TEXT := TG_ARGV[0];
  v_parent_fk_col TEXT := TG_ARGV[1];
  v_new_json      jsonb;
  v_child_fk_val  uuid;
  v_parent_eid    uuid;
BEGIN
  v_new_json := to_jsonb(NEW);
  v_child_fk_val := NULLIF(v_new_json ->> v_parent_fk_col, '')::uuid;

  -- Si la FK est NULL (optionnelle), on laisse l'app fournir entreprise_id directement.
  IF v_child_fk_val IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT entreprise_id FROM %I WHERE id = $1', v_parent_table)
    INTO v_parent_eid
    USING v_child_fk_val;

  IF v_parent_eid IS NULL THEN
    RAISE EXCEPTION 'Parent introuvable (%, id=%) lors de la propagation entreprise_id sur %',
      v_parent_table, v_child_fk_val, TG_TABLE_NAME;
  END IF;

  IF NEW.entreprise_id IS NULL THEN
    NEW.entreprise_id := v_parent_eid;
  ELSIF NEW.entreprise_id <> v_parent_eid THEN
    RAISE EXCEPTION 'Incohérence multi-tenant sur %: entreprise_id=% mais parent %.entreprise_id=%',
      TG_TABLE_NAME, NEW.entreprise_id, v_parent_table, v_parent_eid;
  END IF;

  RETURN NEW;
END
$$;

-- =================================================================
-- 2. Helper d'attachement (idempotent)
-- =================================================================

CREATE OR REPLACE FUNCTION __attach_inherit_trigger(p_child TEXT, p_parent TEXT, p_fk_col TEXT)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Skip si table absente (ex : modules optionnels comme tier_referencement non appliqués)
  IF to_regclass(format('public.%I', p_child)) IS NULL THEN
    RAISE NOTICE 'Table fille % introuvable, skip trigger', p_child;
    RETURN;
  END IF;
  IF to_regclass(format('public.%I', p_parent)) IS NULL THEN
    RAISE NOTICE 'Table parent % introuvable, skip trigger sur %', p_parent, p_child;
    RETURN;
  END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_%s ON %I', p_child, p_child);
  EXECUTE format(
    'CREATE TRIGGER trg_inherit_entreprise_id_%s BEFORE INSERT ON %I '
    'FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id(%L, %L)',
    p_child, p_child, p_parent, p_fk_col
  );
END $$;

-- =================================================================
-- 3. Attachement sur toutes les tables filles
-- =================================================================

-- Catalogue
SELECT __attach_inherit_trigger('fournisseur_contacts',     'fournisseurs',          'fournisseur_id');
SELECT __attach_inherit_trigger('nomenclatures',            'articles',              'article_id');
SELECT __attach_inherit_trigger('nomenclature_lignes',      'nomenclatures',         'nomenclature_id');
SELECT __attach_inherit_trigger('prix_articles',            'articles',              'article_id');
SELECT __attach_inherit_trigger('grille_tarifaire_lignes',  'grilles_tarifaires',    'grille_id');

-- Tiers (historique)
SELECT __attach_inherit_trigger('sous_traitant_contacts',   'sous_traitants',        'sous_traitant_id');

-- Chantiers
SELECT __attach_inherit_trigger('chantier_taches',          'chantiers',             'chantier_id');

-- Commercial
SELECT __attach_inherit_trigger('lignes_devis',             'devis',                 'devis_id');
SELECT __attach_inherit_trigger('postes_internes_devis',    'devis',                 'devis_id');
SELECT __attach_inherit_trigger('repartitions_poste_interne','postes_internes_devis','poste_interne_id');
SELECT __attach_inherit_trigger('composants_ligne_devis',   'lignes_devis',          'ligne_devis_id');

-- Facturation
SELECT __attach_inherit_trigger('lignes_facture',           'factures',              'facture_id');
SELECT __attach_inherit_trigger('situations_travaux',       'chantiers',             'chantier_id');
SELECT __attach_inherit_trigger('lignes_situation',         'situations_travaux',    'situation_id');

-- RH
SELECT __attach_inherit_trigger('employe_habilitations',    'employes',              'employe_id');
SELECT __attach_inherit_trigger('employe_permis',           'employes',              'employe_id');
SELECT __attach_inherit_trigger('employe_documents',        'employes',              'employe_id');
SELECT __attach_inherit_trigger('pointages',                'employes',              'employe_id');

-- Référencement Tiers
SELECT __attach_inherit_trigger('societes_regles',           'societes',               'societe_id');
SELECT __attach_inherit_trigger('tier_corps_etat',           'tiers',                  'tier_id');
SELECT __attach_inherit_trigger('tier_societes_autorisees',  'tiers',                  'tier_id');
SELECT __attach_inherit_trigger('corps_etat_documents_requis','corps_etat',            'corps_etat_id');
SELECT __attach_inherit_trigger('tier_documents',            'tiers',                  'tier_id');
SELECT __attach_inherit_trigger('tier_agrement_relances',    'tiers',                  'tier_id');

-- =================================================================
-- 4. Cleanup : helper d'attachement temporaire
-- =================================================================

DROP FUNCTION __attach_inherit_trigger(TEXT, TEXT, TEXT);

COMMIT;
