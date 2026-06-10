-- 0043_rls_policies.sql
-- Active Row Level Security sur toutes les tables scopées par entreprise_id.
--
-- Stratégie :
--   - ENABLE + FORCE pour que la policy s'applique même à l'owner.
--   - Une policy unique p_tenant par table avec USING + WITH CHECK identiques.
--   - Le rôle app_migrator a BYPASSRLS implicite (owner / SECURITY DEFINER).
--   - Le rôle app_admin (créé en 0037) a BYPASSRLS pour les opérations cross-tenant.
--   - L'app utilise app_rw qui DOIT poser `SET LOCAL app.current_entreprise_id = ?`
--     dans une transaction avant toute requête (helper withTenant côté app).
--
-- Si le GUC n'est pas posé : current_setting('app.current_entreprise_id', true) renvoie '',
-- le cast '' ::uuid lève une erreur → fail-closed, pas de fuite silencieuse.
--
-- Refonte de generate_numero : la séquence devient per-entreprise (numero unique par tenant).

BEGIN;

-- =================================================================
-- 1. Refonte de generate_numero(type, entreprise_id)
-- =================================================================

DROP FUNCTION IF EXISTS generate_numero(TEXT);

CREATE OR REPLACE FUNCTION generate_numero(p_type TEXT, p_entreprise_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entreprise_id UUID;
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_entreprise_short TEXT;
  v_seq_name TEXT;
  v_next INTEGER;
  v_prefix TEXT;
  v_numero TEXT;
BEGIN
  -- Résoudre l'entreprise_id : argument explicite, sinon GUC RLS, sinon erreur.
  v_entreprise_id := COALESCE(
    p_entreprise_id,
    NULLIF(current_setting('app.current_entreprise_id', true), '')::uuid
  );

  IF v_entreprise_id IS NULL THEN
    RAISE EXCEPTION 'generate_numero requiert un entreprise_id (argument explicite ou GUC app.current_entreprise_id)';
  END IF;

  v_prefix := CASE lower(p_type)
    WHEN 'devis'      THEN 'D'
    WHEN 'facture'    THEN 'F'
    WHEN 'commande'   THEN 'C'
    WHEN 'contrat_st' THEN 'ST'
    WHEN 'facture_st' THEN 'FST'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Type de numéro inconnu: %', p_type
      USING HINT = 'Types acceptés : devis, facture, commande, contrat_st, facture_st';
  END IF;

  -- Identifiant court de l'entreprise (8 hex) pour le nom de séquence.
  -- Collision théorique sur 8 hex ~= 1 / 4 milliards → négligeable pour quelques milliers d'entreprises.
  v_entreprise_short := substr(replace(v_entreprise_id::text, '-', ''), 1, 8);
  v_seq_name := format('seq_%s_%s_%s', lower(p_type), v_entreprise_short, v_year);

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1 INCREMENT 1 NO CYCLE', v_seq_name);
  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_next;

  v_numero := format('%s-%s-%s', v_prefix, v_year, lpad(v_next::TEXT, 6, '0'));

  INSERT INTO numeros_attribues (entreprise_id, type_doc, annee, sequence, numero_complet)
  VALUES (v_entreprise_id, lower(p_type), v_year, v_next, v_numero);

  RETURN v_numero;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_numero(TEXT, UUID) TO app_rw, app_admin;

-- =================================================================
-- 2. Helper : active RLS + crée policy p_tenant pour app_rw
--    (factorisé en fonction DO-block pour réduire la verbosité)
-- =================================================================

CREATE OR REPLACE FUNCTION __enable_rls_tenant(p_table TEXT) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- Skip gracieux si la table n'existe pas (ex : module tier_referencement non encore appliqué)
  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RAISE NOTICE 'Table % introuvable, skip RLS', p_table;
    RETURN;
  END IF;
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', p_table);
  -- DROP éventuelle policy existante pour idempotence
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
-- 3. Application aux 32 tables scopées NOT NULL
-- =================================================================

-- Catalogue
SELECT __enable_rls_tenant('familles');
SELECT __enable_rls_tenant('articles');
SELECT __enable_rls_tenant('fournisseurs');
SELECT __enable_rls_tenant('fournisseur_contacts');
SELECT __enable_rls_tenant('nomenclatures');
SELECT __enable_rls_tenant('nomenclature_lignes');
SELECT __enable_rls_tenant('prix_articles');
SELECT __enable_rls_tenant('grilles_tarifaires');
SELECT __enable_rls_tenant('grille_tarifaire_lignes');

-- Tiers (historique)
SELECT __enable_rls_tenant('sous_traitants');
SELECT __enable_rls_tenant('sous_traitant_contacts');

-- Commercial
SELECT __enable_rls_tenant('clients');
SELECT __enable_rls_tenant('devis');
SELECT __enable_rls_tenant('lignes_devis');
SELECT __enable_rls_tenant('postes_internes_devis');
SELECT __enable_rls_tenant('repartitions_poste_interne');
SELECT __enable_rls_tenant('composants_ligne_devis');

-- Chantiers
SELECT __enable_rls_tenant('chantiers');
SELECT __enable_rls_tenant('chantier_taches');

-- RH
SELECT __enable_rls_tenant('employes');
SELECT __enable_rls_tenant('employe_habilitations');
SELECT __enable_rls_tenant('employe_permis');
SELECT __enable_rls_tenant('employe_documents');
SELECT __enable_rls_tenant('pointages');

-- Facturation
SELECT __enable_rls_tenant('factures');
SELECT __enable_rls_tenant('lignes_facture');
SELECT __enable_rls_tenant('situations_travaux');
SELECT __enable_rls_tenant('lignes_situation');

-- Numérotation
SELECT __enable_rls_tenant('numeros_attribues');

-- Référencement Tiers
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
-- 4. audit_log : policy spéciale (entreprise_id NULL = traçabilité super-admin,
--    visible UNIQUEMENT via app_admin BYPASSRLS, jamais via app_rw).
-- =================================================================

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON audit_log;
CREATE POLICY p_tenant ON audit_log
  AS PERMISSIVE
  FOR ALL
  TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

-- =================================================================
-- 5. Cleanup : la fonction helper était temporaire pour cette migration
-- =================================================================

DROP FUNCTION __enable_rls_tenant(TEXT);

COMMIT;
