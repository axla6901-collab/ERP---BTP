-- 0004_generate_numero.sql
-- Table `numeros_attribues` + fonction PG `generate_numero(type)`.
-- Référence : ADR-003 (numérotation des documents métier).
-- Format universel : <PRÉFIXE>-<ANNÉE>-<SÉQUENCE 6 chiffres>
--
-- Appliqué via app_migrator (DDL + CREATE FUNCTION).
-- Idempotent.

-- =================================================================
-- 1. Table registre
-- =================================================================
-- (Le schéma TypeScript miroir est db/schema/numerotation.ts ; ici on s'assure
--  juste qu'elle existe via app_migrator avant que la fonction y INSERT.)

CREATE TABLE IF NOT EXISTS numeros_attribues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_doc TEXT NOT NULL,
  annee INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  numero_complet TEXT NOT NULL,
  attribue_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_numeros_attribues_type_annee_seq UNIQUE (type_doc, annee, sequence)
);

-- Empêcher toute mutation après attribution (append-only).
-- Les seuls droits explicites sont INSERT pour app_rw et SELECT pour audit.
REVOKE UPDATE, DELETE ON numeros_attribues FROM PUBLIC, app_rw;

-- =================================================================
-- 2. Fonction de génération atomique
-- =================================================================

-- SECURITY DEFINER : la fonction s'exécute avec les droits de app_migrator
-- (créateur), ce qui lui permet de CREATE SEQUENCE même quand appelée par app_rw.
-- SET search_path : durcissement contre CVE-2018-1058 (object hijacking).
-- L'input p_type est strictement contraint par le CASE → pas de risque d'injection.
CREATE OR REPLACE FUNCTION generate_numero(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_seq_name TEXT := format('seq_%s_%s', lower(p_type), v_year);
  v_next INTEGER;
  v_prefix TEXT;
  v_numero TEXT;
BEGIN
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

  -- Création idempotente de la séquence pour l'année en cours.
  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS %I START 1 INCREMENT 1 NO CYCLE',
    v_seq_name
  );

  -- nextval est atomique : pas de collision possible.
  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_next;

  v_numero := format('%s-%s-%s', v_prefix, v_year, lpad(v_next::TEXT, 6, '0'));

  -- Trace append-only (justification fiscale en cas de saut).
  INSERT INTO numeros_attribues (type_doc, annee, sequence, numero_complet)
  VALUES (lower(p_type), v_year, v_next, v_numero);

  RETURN v_numero;
END;
$$;

-- Permettre à app_rw d'exécuter la fonction (qui appelle nextval et insère
-- dans numeros_attribues, opérations DML autorisées).
GRANT EXECUTE ON FUNCTION generate_numero(TEXT) TO app_rw;

-- =================================================================
-- 3. Tests de fumée (à exécuter manuellement)
-- =================================================================
-- SELECT generate_numero('devis');     -- doit retourner D-<annee>-000001
-- SELECT generate_numero('facture');   -- F-<annee>-000001
-- SELECT generate_numero('inconnu');   -- doit lever EXCEPTION
-- SELECT * FROM numeros_attribues ORDER BY attribue_at DESC LIMIT 5;
