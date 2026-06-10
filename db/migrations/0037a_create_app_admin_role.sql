-- 0037a_create_app_admin_role.sql
-- Crée le rôle DB app_admin (BYPASSRLS) utilisé par la console super-admin
-- pour les opérations cross-tenant (provisioning d'entreprises, audit global).
--
-- ⚠️ À APPLIQUER EN TANT QUE SUPERUSER (erpbtp), car app_migrator n'a pas CREATEROLE.
--
--   docker exec -i -e PGPASSWORD=erpbtp_dev_password erp-btp-postgres \
--     psql -U erpbtp -d erpbtp < db/migrations/0037a_create_app_admin_role.sql
--
-- Doit être appliquée AVANT 0037_entreprises_core.sql (qui GRANT sur app_admin).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin LOGIN PASSWORD 'app_admin_dev_password' BYPASSRLS NOINHERIT;
  ELSE
    ALTER ROLE app_admin BYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE erpbtp TO app_admin;
GRANT USAGE  ON SCHEMA public    TO app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO app_admin;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO app_admin;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA public TO app_admin;

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO app_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT                  ON SEQUENCES TO app_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT EXECUTE                        ON FUNCTIONS TO app_admin;
