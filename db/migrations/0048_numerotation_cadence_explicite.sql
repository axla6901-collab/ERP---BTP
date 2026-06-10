-- 0048_numerotation_cadence_explicite.sql
-- Cadence de reset configurable par modèle (au lieu d'être déduite des tokens).
--
-- Contexte : 0046 a posé les templates configurables, mais la cadence de
-- reset du compteur était DÉDUITE de la présence des tokens [@Day]/[@Month]/
-- [@Year] dans le template. Cette nouvelle migration rend la cadence
-- **explicite** : nouvelle colonne `cadence_reset` dans modeles_numerotation,
-- avec backfill compat-ascendante depuis les tokens du template existant.
--
-- Règle d'invariant maintenue (côté UI et code) :
--   La cadence ne peut PAS être plus fine que le token date le plus fin du
--   template, sinon le numéro imprimé serait identique pour deux périodes
--   différentes (collision côté FEC). C-à-d :
--     - cadence='jour'  exige [@Day] dans le template
--     - cadence='mois'  exige [@Month] ou [@Day] dans le template
--     - cadence='annee' exige [@Year], [@Year2], [@Month] ou [@Day]
--     - cadence='jamais' toujours OK (compteur global continu)
-- Ce CHECK est posé en BD ET dupliqué côté TS dans lib/numerotation/template.ts.
--
-- Migration vers le nouveau schéma :
--   * Backfill : la cadence est calculée à partir du template existant
--     (mêmes règles que la déduction précédente) → aucun changement de
--     comportement pour les modèles déjà créés.
--   * `generate_numero` lit désormais la colonne `cadence_reset` au lieu de
--     parser les tokens. Le fallback (pas de ligne en BD) reste la cadence
--     annuelle (templates par défaut contiennent tous [@Year]).
--
-- À appliquer en tant que app_migrator :
--   docker exec -i -e PGPASSWORD=app_migrator_dev_password erp-btp-postgres \
--     psql -U app_migrator -d erpbtp < db/migrations/0048_numerotation_cadence_explicite.sql

BEGIN;

-- =================================================================
-- 1. Ajout colonne cadence_reset + backfill
-- =================================================================

ALTER TABLE modeles_numerotation
  ADD COLUMN IF NOT EXISTS cadence_reset TEXT;

-- Backfill compat-ascendante : même logique que la déduction tokens-based
-- de 0046 (priorité [@Day] > [@Month] > [@Year]/[@Year2] > 'jamais').
UPDATE modeles_numerotation
  SET cadence_reset = CASE
    WHEN position('[@Day]'   IN template) > 0 THEN 'jour'
    WHEN position('[@Month]' IN template) > 0 THEN 'mois'
    WHEN position('[@Year]'  IN template) > 0
      OR position('[@Year2]' IN template) > 0 THEN 'annee'
    ELSE 'jamais'
  END
  WHERE cadence_reset IS NULL;

ALTER TABLE modeles_numerotation
  ALTER COLUMN cadence_reset SET NOT NULL;

ALTER TABLE modeles_numerotation
  ALTER COLUMN cadence_reset SET DEFAULT 'annee';

-- Valeurs autorisées.
ALTER TABLE modeles_numerotation
  DROP CONSTRAINT IF EXISTS chk_modeles_numerotation_cadence_valeur;
ALTER TABLE modeles_numerotation
  ADD CONSTRAINT chk_modeles_numerotation_cadence_valeur
  CHECK (cadence_reset IN ('jour', 'mois', 'annee', 'jamais'));

-- Invariant cadence ↔ tokens : la cadence ne peut pas être plus fine que ce
-- que le template affiche, sinon collision de numéro imprimé.
ALTER TABLE modeles_numerotation
  DROP CONSTRAINT IF EXISTS chk_modeles_numerotation_cadence_coherente;
ALTER TABLE modeles_numerotation
  ADD CONSTRAINT chk_modeles_numerotation_cadence_coherente
  CHECK (
    cadence_reset = 'jamais'
    OR (cadence_reset = 'annee' AND (
         template LIKE '%[@Year]%' OR template LIKE '%[@Year2]%'
      OR template LIKE '%[@Month]%' OR template LIKE '%[@Day]%'
    ))
    OR (cadence_reset = 'mois'  AND (
         template LIKE '%[@Month]%' OR template LIKE '%[@Day]%'
    ))
    OR (cadence_reset = 'jour'  AND  template LIKE '%[@Day]%')
  );

-- =================================================================
-- 2. Refonte de generate_numero : lit cadence_reset au lieu de parser
-- =================================================================
-- Signature et comportement externe inchangés (toujours (TEXT, UUID) → TEXT).
-- Le fallback (modèle absent en BD) garde le template historique annuel.

DROP FUNCTION IF EXISTS generate_numero(TEXT, UUID);

CREATE OR REPLACE FUNCTION generate_numero(p_type TEXT, p_entreprise_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entreprise_id     UUID;
  v_type              TEXT := lower(p_type);
  v_template          TEXT;
  v_cadence           TEXT;
  v_year              INTEGER := EXTRACT(YEAR  FROM now())::INTEGER;
  v_year_yyyy         TEXT    := to_char(now(), 'YYYY');
  v_year_yy           TEXT    := to_char(now(), 'YY');
  v_month_mm          TEXT    := to_char(now(), 'MM');
  v_day_dd            TEXT    := to_char(now(), 'DD');
  v_entreprise_short  TEXT;
  v_cle_periode       TEXT;
  v_seq_name          TEXT;
  v_next              INTEGER;
  v_counter_match     TEXT[];
  v_counter_token     TEXT;
  v_counter_width     INTEGER;
  v_numero            TEXT;
BEGIN
  -- Résoudre l'entreprise_id : argument explicite, sinon GUC RLS, sinon erreur.
  v_entreprise_id := COALESCE(
    p_entreprise_id,
    NULLIF(current_setting('app.current_entreprise_id', true), '')::uuid
  );

  IF v_entreprise_id IS NULL THEN
    RAISE EXCEPTION 'generate_numero requiert un entreprise_id (argument explicite ou GUC app.current_entreprise_id)';
  END IF;

  IF v_type NOT IN ('devis', 'facture', 'avoir', 'commande', 'contrat_st', 'facture_st', 'chantier') THEN
    RAISE EXCEPTION 'Type de numéro inconnu: %', p_type
      USING HINT = 'Types acceptés : devis, facture, avoir, commande, contrat_st, facture_st, chantier';
  END IF;

  -- Lire template + cadence configurés pour cette entreprise + ce type.
  -- SECURITY DEFINER → contourne la RLS de app_rw, on filtre explicitement
  -- sur p_entreprise_id pour éviter toute fuite cross-tenant.
  SELECT template, cadence_reset
    INTO v_template, v_cadence
    FROM modeles_numerotation
    WHERE entreprise_id = v_entreprise_id AND type_doc = v_type;

  -- Fallback : template historique + cadence annuelle (compat 0046).
  IF v_template IS NULL THEN
    v_template := CASE v_type
      WHEN 'devis'      THEN 'D-[@Year]-%06d'
      WHEN 'facture'    THEN 'F-[@Year]-%06d'
      WHEN 'avoir'      THEN 'AV-[@Year]-%06d'
      WHEN 'commande'   THEN 'C-[@Year]-%06d'
      WHEN 'contrat_st' THEN 'ST-[@Year]-%06d'
      WHEN 'facture_st' THEN 'FST-[@Year]-%06d'
      WHEN 'chantier'   THEN 'CH-[@Year]-%06d'
    END;
    v_cadence := 'annee';
  END IF;

  -- Clé de période selon la cadence (et non plus les tokens du template).
  IF v_cadence = 'jour' THEN
    v_cle_periode := v_year_yyyy || '-' || v_month_mm || '-' || v_day_dd;
  ELSIF v_cadence = 'mois' THEN
    v_cle_periode := v_year_yyyy || '-' || v_month_mm;
  ELSIF v_cadence = 'annee' THEN
    v_cle_periode := v_year_yyyy;
  ELSE
    v_cle_periode := 'tous';
  END IF;

  -- Nom de séquence Postgres : per-entreprise + per-type + per-période.
  v_entreprise_short := substr(replace(v_entreprise_id::text, '-', ''), 1, 8);
  v_seq_name := format('seq_%s_%s_%s', v_type, v_entreprise_short, v_cle_periode);
  v_seq_name := replace(v_seq_name, '-', '_');

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1 INCREMENT 1 NO CYCLE', v_seq_name);
  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_next;

  -- Extraire la largeur du compteur (ex. '%03d' → 3).
  SELECT regexp_match(v_template, '%0?([1-9])d') INTO v_counter_match;
  IF v_counter_match IS NOT NULL THEN
    v_counter_width := v_counter_match[1]::int;
    v_counter_token := substring(v_template FROM '%0?[1-9]d');
  ELSE
    v_counter_width := 6;
    v_counter_token := '%06d';
  END IF;

  v_numero := v_template;
  v_numero := replace(v_numero, '[@Year]',  v_year_yyyy);
  v_numero := replace(v_numero, '[@Year2]', v_year_yy);
  v_numero := replace(v_numero, '[@Month]', v_month_mm);
  v_numero := replace(v_numero, '[@Day]',   v_day_dd);
  v_numero := replace(v_numero, v_counter_token, lpad(v_next::text, v_counter_width, '0'));

  -- Trace append-only (justification fiscale en cas de saut).
  INSERT INTO numeros_attribues (entreprise_id, type_doc, annee, sequence, numero_complet, cle_periode)
  VALUES (v_entreprise_id, v_type, v_year, v_next, v_numero, v_cle_periode);

  RETURN v_numero;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_numero(TEXT, UUID) TO app_rw, app_admin;

-- =================================================================
-- 3. Tests de fumée (à exécuter manuellement post-migration)
-- =================================================================
-- SET LOCAL app.current_entreprise_id = '<uuid existant>';
-- -- Template sans token date + cadence annuelle = OK (avant : déduit à 'jamais')
-- INSERT INTO modeles_numerotation (entreprise_id, type_doc, template, cadence_reset)
--   VALUES ('<uuid>', 'devis', 'D-%06d', 'annee')
--   ON CONFLICT (entreprise_id, type_doc) DO UPDATE
--     SET template = EXCLUDED.template, cadence_reset = EXCLUDED.cadence_reset;
-- SELECT generate_numero('devis');  -- D-000001 (compteur partagé toutes années)
--
-- -- Doit échouer : cadence quotidienne sans [@Day]
-- INSERT INTO modeles_numerotation (entreprise_id, type_doc, template, cadence_reset)
--   VALUES ('<uuid>', 'avoir', 'AV-[@Year]-%06d', 'jour');
-- -- ERROR: violates check constraint "chk_modeles_numerotation_cadence_coherente"

COMMIT;
