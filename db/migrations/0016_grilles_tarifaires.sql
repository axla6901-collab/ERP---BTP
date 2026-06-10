-- 0016_grilles_tarifaires.sql
-- M2.4 : grilles tarifaires fournisseur — tarif négocié par fournisseur,
-- regroupant N articles sous une même période de validité (validFrom/validTo).
-- Coexiste avec prix_articles (prix ad-hoc / catalogue interne).
-- Étend prix_courant_article() pour consulter les grilles en priorité.
-- Schéma TypeScript miroir : db/schema/catalogue.ts (grillesTarifaires,
-- grilleTarifaireLignes).
-- Appliquée via app_migrator. Idempotente.

-- =================================================================
-- 1. Table grilles_tarifaires (en-tête)
-- =================================================================

CREATE TABLE IF NOT EXISTS grilles_tarifaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur_id UUID NOT NULL REFERENCES fournisseurs(id) ON DELETE RESTRICT,
  libelle TEXT NOT NULL,
  valid_from DATE NOT NULL,
  valid_to DATE,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_grilles_tarifaires_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_grilles_tarifaires_fournisseur
  ON grilles_tarifaires (fournisseur_id, valid_from DESC);

-- Trigger updated_at (cf. 0002_updated_at_trigger.sql)
DROP TRIGGER IF EXISTS trg_grilles_tarifaires_updated_at ON grilles_tarifaires;
CREATE TRIGGER trg_grilles_tarifaires_updated_at
  BEFORE UPDATE ON grilles_tarifaires
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 2. Table grille_tarifaire_lignes (lignes : 1 article = 1 prix)
-- =================================================================

CREATE TABLE IF NOT EXISTS grille_tarifaire_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grille_id UUID NOT NULL REFERENCES grilles_tarifaires(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
  prix_unitaire_ht NUMERIC(14, 2) NOT NULL,
  unite_id UUID NOT NULL REFERENCES unites(id) ON DELETE RESTRICT,
  reference_fournisseur TEXT,
  quantite_min NUMERIC(14, 4),
  notes TEXT,
  CONSTRAINT uq_grille_lignes_grille_article UNIQUE (grille_id, article_id),
  CONSTRAINT chk_grille_lignes_prix_pos CHECK (prix_unitaire_ht >= 0),
  CONSTRAINT chk_grille_lignes_qmin_pos CHECK (quantite_min IS NULL OR quantite_min > 0)
);

CREATE INDEX IF NOT EXISTS idx_grille_lignes_grille
  ON grille_tarifaire_lignes (grille_id);
CREATE INDEX IF NOT EXISTS idx_grille_lignes_article
  ON grille_tarifaire_lignes (article_id);

-- =================================================================
-- 3. Extension de prix_courant_article — intégration des grilles
-- =================================================================
-- Priorité de résolution (la première règle qui matche gagne) :
--   1. Grille active du fournisseur préféré (source: 'grille_prefere')
--   2. Prix fournisseur préféré dans prix_articles (source: 'prefere')
--   3. Prix de référence (fournisseur_id IS NULL) (source: 'reference')
--   4. Grille active la moins chère, tous fournisseurs (source: 'grille_mini')
--   5. Prix le moins cher parmi les fournisseurs (source: 'mini_fournisseur')
--
-- Une grille est "active" à la date D si :
--   - actif = TRUE
--   - deleted_at IS NULL
--   - valid_from <= D
--   - valid_to IS NULL OR valid_to >= D

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

  -- 1. Grille active du fournisseur préféré
  IF v_prefere_id IS NOT NULL THEN
    RETURN QUERY
      SELECT gl.prix_unitaire_ht, gl.unite_id, g.fournisseur_id, 'grille_prefere'::TEXT
        FROM grille_tarifaire_lignes gl
        JOIN grilles_tarifaires g ON g.id = gl.grille_id
       WHERE gl.article_id = p_article_id
         AND g.fournisseur_id = v_prefere_id
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

  -- 4. Grille active la moins chère, tous fournisseurs confondus
  RETURN QUERY
    SELECT gl.prix_unitaire_ht, gl.unite_id, g.fournisseur_id, 'grille_mini'::TEXT
      FROM grille_tarifaire_lignes gl
      JOIN grilles_tarifaires g ON g.id = gl.grille_id
      JOIN fournisseurs f ON f.id = g.fournisseur_id
     WHERE gl.article_id = p_article_id
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

GRANT EXECUTE ON FUNCTION prix_courant_article(UUID, DATE) TO app_rw;
