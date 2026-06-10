-- =================================================================
-- 0051 — Fonction de comptage de l'usage d'une unité (référentiel GLOBAL).
--
-- `unites` n'a pas d'`entreprise_id` (référentiel partagé entre tenants), alors
-- que ses tables référençantes (articles, prix_articles, grille_tarifaire_lignes,
-- nomenclature_lignes) sont tenant-scoped sous RLS. Pour interdire la suppression
-- d'une unité encore utilisée par N'IMPORTE QUEL tenant, il faut un comptage
-- cross-tenant — impossible avec app_rw (RLS fail-closed) sans poser un GUC.
--
-- Solution : une fonction SECURITY DEFINER appelable par app_rw via GRANT EXECUTE.
-- Le bypass RLS dépend du PROPRIÉTAIRE de la fonction (SECURITY DEFINER s'exécute
-- avec ses droits) : il doit donc avoir l'attribut BYPASSRLS. Or seul `app_admin`
-- l'a (app_migrator ne l'a PAS, et `articles` est en FORCE ROW LEVEL SECURITY).
-- On force donc le propriétaire à app_admin. La fonction ne renvoie que des
-- compteurs agrégés (aucune fuite de données d'un autre tenant). Le code métier
-- (lib/catalogue/unites.ts) reste sur app_rw et n'utilise pas le pool admin.
--
-- ⚠️ Appliquer cette migration en superuser (erpbtp) — l'ALTER ... OWNER TO
-- app_admin exige d'être superuser ou membre d'app_admin.
-- =================================================================

CREATE OR REPLACE FUNCTION compter_usage_unite(p_unite_id UUID)
RETURNS TABLE (
  nb_articles INT,
  nb_prix INT,
  nb_grilles INT,
  nb_nomenclatures INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY SELECT
    (SELECT COUNT(*)::int FROM articles a
       WHERE a.unite_achat_id = p_unite_id
          OR a.unite_stock_id = p_unite_id
          OR a.unite_vente_id = p_unite_id),
    (SELECT COUNT(*)::int FROM prix_articles WHERE unite_id = p_unite_id),
    (SELECT COUNT(*)::int FROM grille_tarifaire_lignes WHERE unite_id = p_unite_id),
    (SELECT COUNT(*)::int FROM nomenclature_lignes WHERE unite_emploi_id = p_unite_id);
END;
$$;

-- Propriétaire = app_admin (BYPASSRLS) → le corps de la fonction voit toutes les
-- lignes, tous tenants confondus, malgré le FORCE RLS des tables référençantes.
ALTER FUNCTION compter_usage_unite(UUID) OWNER TO app_admin;

GRANT EXECUTE ON FUNCTION compter_usage_unite(UUID) TO app_rw, app_admin;
