-- 0017_grilles_chantier.sql
-- Permet de rattacher une grille tarifaire à un chantier spécifique
-- (négociation ponctuelle pour ce projet). Le rattachement est OPTIONNEL :
-- une grille sans chantier reste la grille "générale" du fournisseur.
--
-- Étend prix_courant_article() avec un 3e paramètre p_chantier_id : si
-- fourni, les grilles rattachées à ce chantier sont prioritaires sur
-- toutes les autres règles (y compris fournisseur préféré).
--
-- Schéma TypeScript miroir : db/schema/catalogue.ts (grillesTarifaires).
-- Idempotente.

-- =================================================================
-- 1. Colonne chantier_id sur grilles_tarifaires
-- =================================================================

ALTER TABLE grilles_tarifaires
  ADD COLUMN IF NOT EXISTS chantier_id UUID REFERENCES chantiers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_grilles_tarifaires_chantier
  ON grilles_tarifaires (chantier_id)
  WHERE chantier_id IS NOT NULL;

-- =================================================================
-- 2. Réécriture de prix_courant_article — chantier prioritaire
-- =================================================================
-- Priorité de résolution (la première règle qui matche gagne) :
--   0. (si p_chantier_id NOT NULL) Grille active rattachée à ce chantier
--      → source: 'grille_chantier'
--   1. Grille active du fournisseur préféré sans chantier (générale)
--      → source: 'grille_prefere'
--   2. Prix fournisseur préféré dans prix_articles → source: 'prefere'
--   3. Prix de référence (fournisseur_id IS NULL) → source: 'reference'
--   4. Grille active la moins chère sans chantier → source: 'grille_mini'
--   5. Prix le moins cher parmi les fournisseurs → source: 'mini_fournisseur'
--
-- Une grille est "active" à la date D si :
--   - actif = TRUE
--   - deleted_at IS NULL
--   - valid_from <= D
--   - valid_to IS NULL OR valid_to >= D

DROP FUNCTION IF EXISTS prix_courant_article(UUID, DATE);
DROP FUNCTION IF EXISTS prix_courant_article(UUID, DATE, UUID);

CREATE OR REPLACE FUNCTION prix_courant_article(
  p_article_id UUID,
  p_at_date DATE DEFAULT CURRENT_DATE,
  p_chantier_id UUID DEFAULT NULL
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

  -- 0. Grille active rattachée au chantier en cours (prioritaire absolu)
  IF p_chantier_id IS NOT NULL THEN
    RETURN QUERY
      SELECT gl.prix_unitaire_ht, gl.unite_id, g.fournisseur_id, 'grille_chantier'::TEXT
        FROM grille_tarifaire_lignes gl
        JOIN grilles_tarifaires g ON g.id = gl.grille_id
       WHERE gl.article_id = p_article_id
         AND g.chantier_id = p_chantier_id
         AND g.actif = TRUE
         AND g.deleted_at IS NULL
         AND g.valid_from <= p_at_date
         AND (g.valid_to IS NULL OR g.valid_to >= p_at_date)
       ORDER BY gl.prix_unitaire_ht ASC
       LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 1. Grille active du fournisseur préféré (sans chantier — grille générale)
  IF v_prefere_id IS NOT NULL THEN
    RETURN QUERY
      SELECT gl.prix_unitaire_ht, gl.unite_id, g.fournisseur_id, 'grille_prefere'::TEXT
        FROM grille_tarifaire_lignes gl
        JOIN grilles_tarifaires g ON g.id = gl.grille_id
       WHERE gl.article_id = p_article_id
         AND g.fournisseur_id = v_prefere_id
         AND g.chantier_id IS NULL
         AND g.actif = TRUE
         AND g.deleted_at IS NULL
         AND g.valid_from <= p_at_date
         AND (g.valid_to IS NULL OR g.valid_to >= p_at_date)
       ORDER BY g.valid_from DESC
       LIMIT 1;
    IF FOUND THEN RETURN; END IF;
  END IF;

  -- 2. Fournisseur préféré (prix_articles)
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

  -- 3. Prix de référence (fournisseur_id IS NULL)
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

  -- 4. Grille active la moins chère, sans chantier, tous fournisseurs actifs
  RETURN QUERY
    SELECT gl.prix_unitaire_ht, gl.unite_id, g.fournisseur_id, 'grille_mini'::TEXT
      FROM grille_tarifaire_lignes gl
      JOIN grilles_tarifaires g ON g.id = gl.grille_id
      JOIN fournisseurs f ON f.id = g.fournisseur_id
     WHERE gl.article_id = p_article_id
       AND g.chantier_id IS NULL
       AND g.actif = TRUE
       AND g.deleted_at IS NULL
       AND f.deleted_at IS NULL
       AND f.actif = TRUE
       AND g.valid_from <= p_at_date
       AND (g.valid_to IS NULL OR g.valid_to >= p_at_date)
     ORDER BY gl.prix_unitaire_ht ASC
     LIMIT 1;
  IF FOUND THEN RETURN; END IF;

  -- 5. Moins cher parmi les fournisseurs (prix_articles)
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

GRANT EXECUTE ON FUNCTION prix_courant_article(UUID, DATE, UUID) TO app_rw;
