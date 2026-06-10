-- 0007_bom_and_prices.sql
-- M2.2 + M2.3 anticipé : nomenclatures (BOM) versionnées + prix multi-fournisseurs.
-- Schéma TypeScript miroir : db/schema/catalogue.ts
-- ADR : 009-bom-versionnee-prix-historises (à créer)
-- Appliquée via app_migrator. Idempotente.

-- =================================================================
-- 1. Ajout du fournisseur préféré sur articles
-- =================================================================

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS fournisseur_prefere_id UUID REFERENCES fournisseurs(id) ON DELETE SET NULL;

-- =================================================================
-- 2. Table nomenclatures (versions BOM)
-- =================================================================

CREATE TABLE IF NOT EXISTS nomenclatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  libelle TEXT,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  CONSTRAINT uq_nomenclatures_article_version UNIQUE (article_id, version)
);

-- Index unique partiel : une seule version courante par article
CREATE UNIQUE INDEX IF NOT EXISTS uq_nomenclatures_article_active
  ON nomenclatures (article_id) WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_nomenclatures_article ON nomenclatures (article_id);

-- =================================================================
-- 3. Lignes de nomenclature
-- =================================================================

CREATE TABLE IF NOT EXISTS nomenclature_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nomenclature_id UUID NOT NULL REFERENCES nomenclatures(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL DEFAULT 0,
  composant_article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
  quantite NUMERIC(14, 4) NOT NULL,
  unite_emploi_id UUID NOT NULL REFERENCES unites(id) ON DELETE RESTRICT,
  coefficient_perte NUMERIC(5, 4) NOT NULL DEFAULT 0,
  notes TEXT,
  CONSTRAINT chk_nom_lignes_quantite_pos CHECK (quantite > 0),
  CONSTRAINT chk_nom_lignes_perte_range CHECK (coefficient_perte >= 0 AND coefficient_perte < 1)
);

CREATE INDEX IF NOT EXISTS idx_nomenclature_lignes_nomenclature
  ON nomenclature_lignes (nomenclature_id);
CREATE INDEX IF NOT EXISTS idx_nomenclature_lignes_composant
  ON nomenclature_lignes (composant_article_id);

-- =================================================================
-- 4. Trigger anti-cycle sur BOM (BEFORE INSERT/UPDATE)
-- =================================================================

CREATE OR REPLACE FUNCTION check_bom_cycle()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_article UUID;
  v_depth INTEGER := 0;
BEGIN
  -- Article propriétaire de la nomenclature où l'on insère / modifie
  SELECT n.article_id INTO v_parent_article
    FROM nomenclatures n
   WHERE n.id = NEW.nomenclature_id;

  IF v_parent_article = NEW.composant_article_id THEN
    RAISE EXCEPTION 'Cycle BOM : un article ne peut pas se contenir lui-même.';
  END IF;

  -- Descendre dans le composant et chercher si on retrouve v_parent_article
  WITH RECURSIVE descendants AS (
    SELECT nl.composant_article_id, 1 AS depth
      FROM nomenclatures n
      JOIN nomenclature_lignes nl ON nl.nomenclature_id = n.id
     WHERE n.article_id = NEW.composant_article_id
       AND n.valid_to IS NULL
    UNION ALL
    SELECT nl.composant_article_id, d.depth + 1
      FROM descendants d
      JOIN nomenclatures n ON n.article_id = d.composant_article_id AND n.valid_to IS NULL
      JOIN nomenclature_lignes nl ON nl.nomenclature_id = n.id
     WHERE d.depth < 8
  )
  SELECT MAX(depth) INTO v_depth FROM descendants WHERE composant_article_id = v_parent_article;

  IF v_depth IS NOT NULL THEN
    RAISE EXCEPTION 'Cycle BOM détecté : article % apparaît en descendant de % (profondeur %).',
      v_parent_article, NEW.composant_article_id, v_depth;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_bom_cycle ON nomenclature_lignes;
CREATE TRIGGER trg_check_bom_cycle
  BEFORE INSERT OR UPDATE OF composant_article_id ON nomenclature_lignes
  FOR EACH ROW EXECUTE FUNCTION check_bom_cycle();

-- =================================================================
-- 5. Table prix_articles (multi-fournisseurs)
-- =================================================================

CREATE TABLE IF NOT EXISTS prix_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  prix_unitaire_ht NUMERIC(14, 2) NOT NULL,
  unite_id UUID NOT NULL REFERENCES unites(id) ON DELETE RESTRICT,
  fournisseur_id UUID REFERENCES fournisseurs(id) ON DELETE SET NULL,
  reference_fournisseur TEXT,
  quantite_min NUMERIC(14, 4),
  valid_from DATE NOT NULL,
  valid_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  CONSTRAINT chk_prix_articles_prix_pos CHECK (prix_unitaire_ht >= 0),
  CONSTRAINT chk_prix_articles_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_prix_articles_article_date
  ON prix_articles (article_id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_prix_articles_article_fournisseur
  ON prix_articles (article_id, fournisseur_id);

-- =================================================================
-- 6. Fonction prix_courant_article(article_id, at_date)
-- =================================================================
-- Règle de sélection en 4 étapes (préféré → référence → moins cher → erreur).
-- Retourne le prix retenu + source (`prefere` / `reference` / `mini_fournisseur`).

DROP FUNCTION IF EXISTS prix_courant_article(UUID, DATE);
CREATE OR REPLACE FUNCTION prix_courant_article(
  p_article_id UUID,
  p_at_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(prix NUMERIC, unite_id UUID, fournisseur_id UUID, source TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prefere_id UUID;
BEGIN
  SELECT a.fournisseur_prefere_id INTO v_prefere_id
    FROM articles a WHERE a.id = p_article_id AND a.deleted_at IS NULL;

  -- 1. Fournisseur préféré
  IF v_prefere_id IS NOT NULL THEN
    RETURN QUERY
      SELECT p.prix_unitaire_ht, p.unite_id, p.fournisseur_id, 'prefere'::TEXT
        FROM prix_articles p
       WHERE p.article_id = p_article_id
         AND p.fournisseur_id = v_prefere_id
         AND p.valid_from <= p_at_date
         AND (p.valid_to IS NULL OR p.valid_to >= p_at_date)
       ORDER BY p.valid_from DESC
       LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. Prix de référence (fournisseur_id IS NULL)
  RETURN QUERY
    SELECT p.prix_unitaire_ht, p.unite_id, p.fournisseur_id, 'reference'::TEXT
      FROM prix_articles p
     WHERE p.article_id = p_article_id
       AND p.fournisseur_id IS NULL
       AND p.valid_from <= p_at_date
       AND (p.valid_to IS NULL OR p.valid_to >= p_at_date)
     ORDER BY p.valid_from DESC
     LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 3. Moins cher parmi les fournisseurs actifs
  RETURN QUERY
    SELECT p.prix_unitaire_ht, p.unite_id, p.fournisseur_id, 'mini_fournisseur'::TEXT
      FROM prix_articles p
     WHERE p.article_id = p_article_id
       AND p.fournisseur_id IS NOT NULL
       AND p.valid_from <= p_at_date
       AND (p.valid_to IS NULL OR p.valid_to >= p_at_date)
     ORDER BY p.prix_unitaire_ht ASC
     LIMIT 1;
  -- Pas d'erreur si rien trouvé : on retourne 0 ligne (le caller décide)
END;
$$;

GRANT EXECUTE ON FUNCTION prix_courant_article(UUID, DATE) TO app_rw;

-- =================================================================
-- 7. Fonction bom_explode(article_id, at_date) — BOM aplatie récursive
-- =================================================================

DROP FUNCTION IF EXISTS bom_explode(UUID, DATE);
CREATE OR REPLACE FUNCTION bom_explode(
  p_article_id UUID,
  p_at_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  profondeur INTEGER,
  chemin TEXT,
  composant_id UUID,
  composant_code TEXT,
  composant_libelle TEXT,
  composant_type article_type,
  quantite_brute NUMERIC,
  quantite_avec_perte NUMERIC,
  coefficient_perte NUMERIC,
  unite_emploi_id UUID,
  est_feuille BOOLEAN,
  ligne_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE bom AS (
    -- Premier niveau : lignes directes de la version courante (à p_at_date) de p_article_id
    SELECT 1 AS depth,
           a.code::TEXT AS path,
           nl.composant_article_id,
           a.code AS comp_code,
           a.libelle AS comp_libelle,
           a.type AS comp_type,
           nl.quantite AS qty_brute,
           nl.quantite * (1 + nl.coefficient_perte) AS qty_perte,
           nl.coefficient_perte,
           nl.unite_emploi_id,
           nl.id AS ligne_id
      FROM nomenclatures n
      JOIN nomenclature_lignes nl ON nl.nomenclature_id = n.id
      JOIN articles a ON a.id = nl.composant_article_id
     WHERE n.article_id = p_article_id
       AND n.valid_from <= p_at_date::timestamptz
       AND (n.valid_to IS NULL OR n.valid_to >= p_at_date::timestamptz)
    UNION ALL
    -- Niveaux suivants : récurse dans les BOM des composants composés
    SELECT b.depth + 1,
           b.path || ' > ' || a.code,
           nl.composant_article_id,
           a.code,
           a.libelle,
           a.type,
           b.qty_perte * nl.quantite AS qty_brute,
           b.qty_perte * nl.quantite * (1 + nl.coefficient_perte) AS qty_perte,
           nl.coefficient_perte,
           nl.unite_emploi_id,
           nl.id
      FROM bom b
      JOIN nomenclatures n ON n.article_id = b.composant_article_id
        AND n.valid_from <= p_at_date::timestamptz
        AND (n.valid_to IS NULL OR n.valid_to >= p_at_date::timestamptz)
      JOIN nomenclature_lignes nl ON nl.nomenclature_id = n.id
      JOIN articles a ON a.id = nl.composant_article_id
     WHERE b.depth < 8
  )
  SELECT b.depth, b.path, b.composant_article_id, b.comp_code, b.comp_libelle, b.comp_type,
         b.qty_brute, b.qty_perte, b.coefficient_perte, b.unite_emploi_id,
         -- Est feuille si pas de nomenclature courante en aval
         NOT EXISTS (
           SELECT 1 FROM nomenclatures n2
            WHERE n2.article_id = b.composant_article_id
              AND n2.valid_from <= p_at_date::timestamptz
              AND (n2.valid_to IS NULL OR n2.valid_to >= p_at_date::timestamptz)
         ) AS is_leaf,
         b.ligne_id
    FROM bom b
   ORDER BY b.path;
END;
$$;

GRANT EXECUTE ON FUNCTION bom_explode(UUID, DATE) TO app_rw;

-- =================================================================
-- 8. Fonction bom_cost_roll(article_id, at_date) — prix de revient récursif
-- =================================================================

DROP FUNCTION IF EXISTS bom_cost_roll(UUID, DATE);
CREATE OR REPLACE FUNCTION bom_cost_roll(
  p_article_id UUID,
  p_at_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(total NUMERIC, missing_count INTEGER, missing_articles UUID[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total NUMERIC(14, 2) := 0;
  v_missing INTEGER := 0;
  v_missing_arr UUID[] := ARRAY[]::UUID[];
  v_row RECORD;
  v_prix NUMERIC;
BEGIN
  FOR v_row IN
    SELECT * FROM bom_explode(p_article_id, p_at_date) WHERE est_feuille
  LOOP
    SELECT prix INTO v_prix
      FROM prix_courant_article(v_row.composant_id, p_at_date)
     LIMIT 1;
    IF v_prix IS NULL THEN
      v_missing := v_missing + 1;
      v_missing_arr := array_append(v_missing_arr, v_row.composant_id);
    ELSE
      v_total := v_total + (v_prix * v_row.quantite_avec_perte);
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_total, v_missing, v_missing_arr;
END;
$$;

GRANT EXECUTE ON FUNCTION bom_cost_roll(UUID, DATE) TO app_rw;

-- =================================================================
-- 9. Fonction bom_where_used(article_id) — recherche inverse
-- =================================================================

DROP FUNCTION IF EXISTS bom_where_used(UUID);
CREATE OR REPLACE FUNCTION bom_where_used(p_article_id UUID)
RETURNS TABLE(parent_id UUID, parent_code TEXT, parent_libelle TEXT, profondeur INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE up AS (
    SELECT n.article_id AS parent_article_id, 1 AS depth
      FROM nomenclatures n
      JOIN nomenclature_lignes nl ON nl.nomenclature_id = n.id
     WHERE nl.composant_article_id = p_article_id
       AND n.valid_to IS NULL
    UNION ALL
    SELECT n.article_id, u.depth + 1
      FROM up u
      JOIN nomenclature_lignes nl ON nl.composant_article_id = u.parent_article_id
      JOIN nomenclatures n ON n.id = nl.nomenclature_id AND n.valid_to IS NULL
     WHERE u.depth < 8
  )
  SELECT DISTINCT u.parent_article_id, a.code, a.libelle, u.depth
    FROM up u
    JOIN articles a ON a.id = u.parent_article_id
   WHERE a.deleted_at IS NULL
   ORDER BY u.depth, a.code;
END;
$$;

GRANT EXECUTE ON FUNCTION bom_where_used(UUID) TO app_rw;
