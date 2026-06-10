-- 0007b_fix_bom_explode.sql
-- Fix : la CTE récursive de bom_explode imposait des types incohérents
-- entre le terme non-récursif (NUMERIC(5,4) pour coefficient_perte,
-- NUMERIC(14,4) pour quantite) et le terme récursif (NUMERIC après calcul).
-- Postgres rejette : "recursive query column N has type X in non-recursive
-- term but type Y overall". On caste explicitement vers NUMERIC sans précision.

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
           nl.quantite::NUMERIC AS qty_brute,
           (nl.quantite * (1 + nl.coefficient_perte))::NUMERIC AS qty_perte,
           nl.coefficient_perte::NUMERIC AS coef_perte,
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
           (b.path || ' > ' || a.code)::TEXT,
           nl.composant_article_id,
           a.code,
           a.libelle,
           a.type,
           (b.qty_perte * nl.quantite)::NUMERIC AS qty_brute,
           (b.qty_perte * nl.quantite * (1 + nl.coefficient_perte))::NUMERIC AS qty_perte,
           nl.coefficient_perte::NUMERIC AS coef_perte,
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
         b.qty_brute, b.qty_perte, b.coef_perte, b.unite_emploi_id,
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
