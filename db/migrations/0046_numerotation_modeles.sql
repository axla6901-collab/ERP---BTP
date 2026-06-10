-- 0046_numerotation_modeles.sql
-- Templates de numérotation configurables par entreprise + par type de document.
--
-- Tokens supportés dans `template` (PostgreSQL côté serveur, miroir TS dans
-- lib/numerotation/template.ts utilisé pour la prévisualisation) :
--   [@Year]   → année sur 4 chiffres (YYYY)
--   [@Year2]  → année sur 2 chiffres (YY)
--   [@Month]  → mois sur 2 chiffres (MM)
--   [@Day]    → jour sur 2 chiffres (DD)
--   %0Nd      → compteur zero-padded sur N chiffres (ex. %03d → 001, 002 …)
--   %d        → compteur sans padding
--   tout le reste = texte littéral (préfixes type 'CST', 'D-', etc.)
--
-- Exemples :
--   'D-[@Year]-%06d'              → D-2026-000001              (défaut historique devis)
--   'CST[@Year][@Month][@Day]%03d' → CST20260526001             (cadence quotidienne)
--   'FAC[@Year2]/%05d'            → FAC26/00001                (cadence annuelle, 5 chiffres)
--
-- Cadence de reset de la séquence : déterminée automatiquement à partir des
-- tokens présents dans le template.
--   [@Day]   présent → reset quotidien  (clé '2026-05-26')
--   [@Month] présent → reset mensuel    (clé '2026-05')
--   [@Year]  ou [@Year2] présent → reset annuel (clé '2026')
--   aucun token date → jamais (clé 'tous')
--
-- Migration vers le nouveau schéma :
--   * Les numéros déjà attribués restent intangibles (registre append-only
--     numeros_attribues, exigence fiscale FEC).
--   * Tant qu'aucun modèle n'est défini, generate_numero applique le format
--     historique par défaut (D-YYYY-NNNNNN) → backward compatible.
--   * Les séquences Postgres existantes (seq_devis_<entreprise>_2026, ...)
--     continuent d'être utilisées si le template conserve la cadence annuelle,
--     donc pas de saut de numérotation.
--
-- À appliquer en tant que app_migrator :
--   docker exec -i -e PGPASSWORD=app_migrator_dev_password erp-btp-postgres \
--     psql -U app_migrator -d erpbtp < db/migrations/0046_numerotation_modeles.sql

BEGIN;

-- =================================================================
-- 1. Évolution de numeros_attribues : ajout de cle_periode
-- =================================================================
-- L'ancienne unicité (entreprise, type, annee, sequence) ne suffit plus dès
-- que la cadence devient mensuelle ou quotidienne : on porte la clé d'unicité
-- sur (entreprise, type, cle_periode, sequence).

ALTER TABLE numeros_attribues
  ADD COLUMN IF NOT EXISTS cle_periode TEXT;

-- FORCE RLS (cf. 0043) soumet aussi le owner app_migrator à la policy p_tenant.
-- Sans GUC app.current_entreprise_id, le UPDATE ne touche rien et le SET NOT NULL
-- échoue. On bascule temporairement en NO FORCE pour le backfill.
ALTER TABLE numeros_attribues NO FORCE ROW LEVEL SECURITY;

-- Backfill : pour les lignes historiques, la cadence était annuelle.
UPDATE numeros_attribues
  SET cle_periode = annee::text
  WHERE cle_periode IS NULL;

ALTER TABLE numeros_attribues
  ALTER COLUMN cle_periode SET NOT NULL;

-- Bascule de la contrainte d'unicité.
-- L'ancienne version pouvait avoir été matérialisée comme INDEX UNIQUE (poussée
-- par drizzle-kit) ou comme CONSTRAINT — on dégage les deux variantes.
ALTER TABLE numeros_attribues
  DROP CONSTRAINT IF EXISTS uq_numeros_attribues_entreprise_type_annee_seq;
ALTER TABLE numeros_attribues
  DROP CONSTRAINT IF EXISTS uq_numeros_attribues_type_annee_seq;
DROP INDEX IF EXISTS uq_numeros_attribues_entreprise_type_annee_seq;
DROP INDEX IF EXISTS uq_numeros_attribues_type_annee_seq;

-- Idempotence : DROP avant ré-ADD si on rejoue la migration.
ALTER TABLE numeros_attribues
  DROP CONSTRAINT IF EXISTS uq_numeros_attribues_entreprise_type_periode_seq;
ALTER TABLE numeros_attribues
  ADD CONSTRAINT uq_numeros_attribues_entreprise_type_periode_seq
    UNIQUE (entreprise_id, type_doc, cle_periode, sequence);

-- =================================================================
-- 1bis. Seed des séquences per-entreprise
-- =================================================================
-- 0043 a renommé les séquences (`seq_<type>_<entreprise>_<year>`) mais sans
-- migrer les valeurs des séquences mono-tenant créées par 0004
-- (`seq_<type>_<year>`). Sans ce seed, la 1re génération depuis 0043 colliderait
-- avec les numéros déjà attribués. Exécuté pendant que numeros_attribues est
-- encore en NO FORCE RLS (placé avant le ré-enabling FORCE plus bas).

DO $do$
DECLARE
  r RECORD;
  v_entreprise_short TEXT;
  v_seq_name TEXT;
BEGIN
  FOR r IN
    SELECT entreprise_id, type_doc, cle_periode, MAX(sequence) AS max_seq
      FROM numeros_attribues
      GROUP BY entreprise_id, type_doc, cle_periode
  LOOP
    v_entreprise_short := substr(replace(r.entreprise_id::text, '-', ''), 1, 8);
    v_seq_name := format('seq_%s_%s_%s', r.type_doc, v_entreprise_short, replace(r.cle_periode, '-', '_'));
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1 INCREMENT 1 NO CYCLE', v_seq_name);
    EXECUTE format('SELECT setval(%L, %s, true)', v_seq_name, r.max_seq);
  END LOOP;
END $do$;

-- Restaure FORCE RLS désactivé en début de migration pour le backfill + seed.
ALTER TABLE numeros_attribues FORCE ROW LEVEL SECURITY;

-- =================================================================
-- 2. Table modeles_numerotation
-- =================================================================

CREATE TABLE IF NOT EXISTS modeles_numerotation (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id uuid NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
  type_doc      text NOT NULL,
  template      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text REFERENCES utilisateurs(id) ON DELETE SET NULL,
  CONSTRAINT chk_modeles_numerotation_type
    CHECK (type_doc IN ('devis', 'facture', 'avoir', 'commande', 'contrat_st', 'facture_st', 'chantier')),
  CONSTRAINT chk_modeles_numerotation_template_non_vide
    CHECK (length(trim(template)) > 0),
  CONSTRAINT chk_modeles_numerotation_template_compteur
    CHECK (template ~ '%0?[1-9]d')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_modeles_numerotation_entreprise_type
  ON modeles_numerotation (entreprise_id, type_doc);

DROP TRIGGER IF EXISTS trg_modeles_numerotation_updated_at ON modeles_numerotation;
CREATE TRIGGER trg_modeles_numerotation_updated_at
  BEFORE UPDATE ON modeles_numerotation
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 3. RLS — convention p_tenant (cf. 0043_rls_policies.sql)
-- =================================================================

ALTER TABLE modeles_numerotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE modeles_numerotation FORCE  ROW LEVEL SECURITY;

-- Policy TO PUBLIC (et non TO app_rw) pour que la lecture par generate_numero
-- (SECURITY DEFINER → current_user devient app_migrator) ne soit pas filtrée
-- à vide. La sécurité multi-tenant reste assurée par le filtre sur
-- app.current_entreprise_id que `withTenant` positionne avant tout appel.
DROP POLICY IF EXISTS p_tenant ON modeles_numerotation;
CREATE POLICY p_tenant ON modeles_numerotation
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING       (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK  (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON modeles_numerotation TO app_rw, app_admin;

-- =================================================================
-- 3bis. Correctif latent sur la policy RLS de numeros_attribues
-- =================================================================
-- La policy posée par 0043 (`TO app_rw`) ne s'applique pas au current_user
-- effectif quand generate_numero (SECURITY DEFINER, owner = app_migrator) fait
-- son INSERT — FORCE RLS rejetait alors l'INSERT. On élargit la policy à
-- PUBLIC : la sécurité multi-tenant reste assurée par la condition
-- USING/WITH CHECK sur app.current_entreprise_id (que la session app_rw
-- positionne via withTenant avant tout appel).

DROP POLICY IF EXISTS p_tenant ON numeros_attribues;
CREATE POLICY p_tenant ON numeros_attribues
  AS PERMISSIVE FOR ALL TO PUBLIC
  USING       (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK  (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

-- =================================================================
-- 4. Refonte de generate_numero (templates + nouveaux types)
-- =================================================================
-- Signature inchangée : (p_type TEXT, p_entreprise_id UUID).
-- Ajout des types 'avoir' et 'chantier' (chantier était listé côté TS dans
-- lib/numbering/generate.ts mais absent du CASE PG, bug latent corrigé ici).

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

  -- Vérifier que le type est connu (préserve la garde anti-typo).
  IF v_type NOT IN ('devis', 'facture', 'avoir', 'commande', 'contrat_st', 'facture_st', 'chantier') THEN
    RAISE EXCEPTION 'Type de numéro inconnu: %', p_type
      USING HINT = 'Types acceptés : devis, facture, avoir, commande, contrat_st, facture_st, chantier';
  END IF;

  -- Lire le template configuré pour cette entreprise + ce type.
  -- SECURITY DEFINER → contourne la RLS de app_rw, mais on filtre explicitement
  -- sur p_entreprise_id pour éviter toute fuite cross-tenant.
  SELECT template INTO v_template
    FROM modeles_numerotation
    WHERE entreprise_id = v_entreprise_id AND type_doc = v_type;

  -- Fallback : template par défaut, identique au format historique (D-YYYY-NNNNNN).
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
  END IF;

  -- Déterminer la cadence de la séquence (granularité de reset) :
  -- présence d'un token date plus fin → reset plus fréquent.
  IF position('[@Day]' IN v_template) > 0 THEN
    v_cle_periode := v_year_yyyy || '-' || v_month_mm || '-' || v_day_dd;
  ELSIF position('[@Month]' IN v_template) > 0 THEN
    v_cle_periode := v_year_yyyy || '-' || v_month_mm;
  ELSIF position('[@Year]' IN v_template) > 0 OR position('[@Year2]' IN v_template) > 0 THEN
    v_cle_periode := v_year_yyyy;
  ELSE
    v_cle_periode := 'tous';
  END IF;

  -- Nom de la séquence Postgres : per-entreprise + per-type + per-période.
  -- 8 hex de l'UUID entreprise pour rester sous la limite des 63 chars d'identifiant.
  v_entreprise_short := substr(replace(v_entreprise_id::text, '-', ''), 1, 8);
  v_seq_name := format('seq_%s_%s_%s', v_type, v_entreprise_short, v_cle_periode);
  -- Remplace les caractères non sûrs pour un identifiant (ex. '-' en '_').
  v_seq_name := replace(v_seq_name, '-', '_');

  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I START 1 INCREMENT 1 NO CYCLE', v_seq_name);
  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_next;

  -- Extraire la largeur du compteur (ex. '%03d' → 3, '%d' → 0 = pas de padding).
  SELECT regexp_match(v_template, '%0?([1-9])d') INTO v_counter_match;
  IF v_counter_match IS NOT NULL THEN
    v_counter_width := v_counter_match[1]::int;
    v_counter_token := substring(v_template FROM '%0?[1-9]d');
  ELSE
    -- Le template doit contenir un compteur (contrôlé par CHECK), mais sécurité.
    v_counter_width := 6;
    v_counter_token := '%06d';
  END IF;

  -- Appliquer les substitutions.
  v_numero := v_template;
  v_numero := replace(v_numero, '[@Year]',  v_year_yyyy);
  v_numero := replace(v_numero, '[@Year2]', v_year_yy);
  v_numero := replace(v_numero, '[@Month]', v_month_mm);
  v_numero := replace(v_numero, '[@Day]',   v_day_dd);
  v_numero := replace(v_numero, v_counter_token, lpad(v_next::text, v_counter_width, '0'));

  -- Trace append-only (justification fiscale en cas de saut).
  -- annee reste rempli pour compatibilité ascendante des requêtes existantes.
  INSERT INTO numeros_attribues (entreprise_id, type_doc, annee, sequence, numero_complet, cle_periode)
  VALUES (v_entreprise_id, v_type, v_year, v_next, v_numero, v_cle_periode);

  RETURN v_numero;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_numero(TEXT, UUID) TO app_rw, app_admin;

-- =================================================================
-- 5. Tests de fumée (à exécuter manuellement post-migration)
-- =================================================================
-- SET LOCAL app.current_entreprise_id = '<uuid existant>';
-- SELECT generate_numero('devis');     -- avec template par défaut → D-2026-NNNNNN
-- SELECT generate_numero('avoir');     -- nouveau type → AV-2026-NNNNNN
-- SELECT generate_numero('chantier');  -- nouveau type → CH-2026-NNNNNN
-- INSERT INTO modeles_numerotation (entreprise_id, type_doc, template)
--   VALUES ('<uuid>', 'devis', 'CST[@Year][@Month][@Day]%03d');
-- SELECT generate_numero('devis');     -- CST20260526001 (cadence quotidienne, séquence séparée)

COMMIT;
