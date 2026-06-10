-- 0067_prix_reference_prioritaire.sql
-- M2.x : le prix de référence (re)devient le prix RETENU dès qu'il est saisi.
--
-- CONTEXTE : 0061 avait fait du prix de référence générique
-- (prix_articles.fournisseur_id IS NULL) le REPLI ULTIME (après tous les prix
-- fournisseurs). Décision métier revue le 2026-06-10 : le prix de référence est
-- le prix catalogue interne faisant foi ; dès qu'il est renseigné, il doit être
-- le « prix retenu pour le calcul de revient » — il prime donc sur les prix
-- fournisseurs (grilles, préféré, moins-disant), qui ne servent plus que de
-- repli quand AUCUNE référence n'existe.
--
-- NOUVEL ORDRE de priorité :
--   0. (chantier) Grille active rattachée au chantier  → 'grille_chantier'
--      ↑ conservée au-dessus de la référence : c'est un prix négocié EXPLICITE
--        et CONTEXTUEL pour un chantier donné, de spécificité supérieure à un
--        prix catalogue générique. Seule exception au « la référence prime ».
--   1. Prix de référence (fournisseur_id IS NULL)      → 'reference'   ← prix retenu
--   2. Grille active du fournisseur préféré            → 'grille_prefere'
--   3. Prix fournisseur préféré (prix_articles)        → 'prefere'
--   4. Grille active la moins chère                    → 'grille_mini'
--   5. Prix le moins cher parmi les fournisseurs       → 'mini_fournisseur'
--
-- (Inverse de 0061, qui plaçait 'reference' en dernier.) Le reste de la
-- sémantique — fenêtres de validité, sources, signature (UUID, DATE, UUID) —
-- est inchangé. `bom_cost_roll` hérite automatiquement du nouvel ordre puisqu'il
-- appelle `prix_courant_article` pour chaque composant feuille.
--
-- ⚠️ CREATE OR REPLACE (PAS DROP + CREATE) : préserve le propriétaire `app_admin`
-- (BYPASSRLS) posé par 0057. Un DROP+CREATE réattribuerait la fonction au rôle
-- qui applique la migration et recasserait le contournement RLS (fail-closed →
-- « le prix ne remonte jamais »). L'ALTER OWNER + GRANT en fin de fichier
-- ré-affirment l'état attendu (idempotent).
--
-- ⚠️ Appliquer en superuser (erpbtp) ou en tant que membre d'app_admin —
-- l'ALTER ... OWNER TO app_admin l'exige.

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

  -- 1. Prix de référence (fournisseur_id IS NULL) — PRIX RETENU dès qu'il existe
  --    Prix catalogue interne faisant foi : il prime sur tous les prix
  --    fournisseurs ci-dessous (cf. décision 2026-06-10, ré-inversion de 0061).
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

  -- 2. Grille active du fournisseur préféré (sans chantier — grille générale)
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

  -- 3. Fournisseur préféré (prix_articles)
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

  -- 5. Moins cher parmi les fournisseurs (prix_articles) — REPLI ULTIME
  --    Utilisé seulement si aucune référence ni aucun prix préféré n'existe.
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

-- Ré-affirmation idempotente de l'état attendu (cf. 0057). CREATE OR REPLACE
-- préserve déjà owner + grants quand la fonction existe ; ces lignes couvrent
-- le cas d'une création « à froid » et la lisibilité de l'intention.
ALTER FUNCTION prix_courant_article(UUID, DATE, UUID) OWNER TO app_admin;
GRANT EXECUTE ON FUNCTION prix_courant_article(UUID, DATE, UUID) TO app_rw, app_admin;
