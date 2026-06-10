-- =================================================================
-- 0057 — Correctif : propriétaire des fonctions SECURITY DEFINER.
--
-- BUG : `prix_courant_article`, `bom_cost_roll`, `bom_explode`,
-- `bom_where_used` et `generate_numero` sont des fonctions SECURITY DEFINER
-- conçues pour contourner la RLS (elles filtrent explicitement par paramètre
-- : article_id ou entreprise_id). Elles ont été créées AVANT la RLS (0043) et
-- sont restées owned par `app_migrator`.
--
-- Or `app_migrator` n'a PAS l'attribut BYPASSRLS (seul `app_admin` l'a), et la
-- policy tenant `p_tenant` n'est accordée qu'au rôle `app_rw`. Comme les tables
-- (prix_articles, nomenclatures, modeles_numerotation, …) sont en FORCE ROW
-- LEVEL SECURITY, le corps de ces fonctions — exécuté avec les droits de
-- `app_migrator`, qu'AUCUNE policy ne couvre — est filtré « fail-closed » :
--   • prix_courant_article → 0 ligne (le prix ne « remonte » jamais : ni dans
--     « Prix retenu pour le calcul de revient », ni dans le prix de revient des
--     articles composés) ;
--   • bom_cost_roll/explode/where_used → idem (et bom_cost_roll appelle
--     prix_courant_article : tant que celle-ci n'est pas réparée, la chaîne BOM
--     reste cassée même si les autres sont réparées) ;
--   • generate_numero → ne lit jamais le template configuré, retombe toujours
--     sur le template fallback (les modèles de numérotation 0046/0048 sont
--     ignorés).
--
-- FIX : forcer le propriétaire à `app_admin` (BYPASSRLS), comme l'a fait 0051
-- pour `compter_usage_unite`. Chaque fonction reste scoping par son paramètre
-- (UUID globalement unique, lié à un seul tenant) → aucune fuite cross-tenant.
-- Le code métier reste sur `app_rw` (GRANT EXECUTE déjà en place).
--
-- ⚠️ Appliquer cette migration en superuser (erpbtp) — l'ALTER ... OWNER TO
-- app_admin exige d'être superuser ou membre d'app_admin.
-- =================================================================

ALTER FUNCTION prix_courant_article(UUID, DATE, UUID) OWNER TO app_admin;
ALTER FUNCTION bom_cost_roll(UUID, DATE)              OWNER TO app_admin;
ALTER FUNCTION bom_explode(UUID, DATE)                OWNER TO app_admin;
ALTER FUNCTION bom_where_used(UUID)                   OWNER TO app_admin;
ALTER FUNCTION generate_numero(TEXT, UUID)            OWNER TO app_admin;

-- Re-grant explicite (idempotent) — l'ALTER OWNER préserve les GRANT existants,
-- on les ré-affirme pour la lisibilité de l'état attendu.
GRANT EXECUTE ON FUNCTION prix_courant_article(UUID, DATE, UUID) TO app_rw, app_admin;
GRANT EXECUTE ON FUNCTION bom_cost_roll(UUID, DATE)              TO app_rw, app_admin;
GRANT EXECUTE ON FUNCTION bom_explode(UUID, DATE)                TO app_rw, app_admin;
GRANT EXECUTE ON FUNCTION bom_where_used(UUID)                   TO app_rw, app_admin;
GRANT EXECUTE ON FUNCTION generate_numero(TEXT, UUID)            TO app_rw, app_admin;
