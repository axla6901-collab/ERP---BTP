-- 0018_fix_bom_explode_date_compare.sql
-- Correction d'un bug dans bom_explode : la fonction comparait
-- nomenclatures.valid_from (timestamptz) à p_at_date::timestamptz
-- (= minuit du jour), ce qui excluait toute BOM créée après 00:00:00
-- du même jour — y compris le jour de sa création.
--
-- Symptôme observé : un article composé GO002 avec une BOM créée
-- aujourd'hui à 09:56 retournait bom_cost_roll(...) = 0 (au lieu du prix
-- de revient attendu) car bom_explode considérait sa BOM comme « future ».
--
-- Correctif : caster valid_from et valid_to en DATE pour comparer à la
-- granularité jour. Symétrique côté valid_from / valid_to par cohérence.
-- Idempotent.

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
    -- Casts NUMERIC pour aligner les types avec le récursif (sinon Postgres
    -- échoue : "column has type numeric(14,4) in non-recursive term but
    -- type numeric overall").
    SELECT 1 AS depth,
           a.code::TEXT AS path,
           nl.composant_article_id,
           a.code AS comp_code,
           a.libelle AS comp_libelle,
           a.type AS comp_type,
           nl.quantite::NUMERIC AS qty_brute,
           (nl.quantite * (1 + nl.coefficient_perte))::NUMERIC AS qty_perte,
           nl.coefficient_perte::NUMERIC,
           nl.unite_emploi_id,
           nl.id AS ligne_id
      FROM nomenclatures n
      JOIN nomenclature_lignes nl ON nl.nomenclature_id = n.id
      JOIN articles a ON a.id = nl.composant_article_id
     WHERE n.article_id = p_article_id
       AND n.valid_from::date <= p_at_date
       AND (n.valid_to IS NULL OR n.valid_to::date >= p_at_date)
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
        AND n.valid_from::date <= p_at_date
        AND (n.valid_to IS NULL OR n.valid_to::date >= p_at_date)
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
              AND n2.valid_from::date <= p_at_date
              AND (n2.valid_to IS NULL OR n2.valid_to::date >= p_at_date)
         ) AS is_leaf,
         b.ligne_id
    FROM bom b
   ORDER BY b.path;
END;
$$;

GRANT EXECUTE ON FUNCTION bom_explode(UUID, DATE) TO app_rw;
