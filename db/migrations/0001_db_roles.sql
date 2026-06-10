-- 0001_db_roles.sql
-- Objectif : séparer les privilèges DB en deux rôles applicatifs
--   - app_migrator : DDL (CREATE/ALTER/DROP) + DML — utilisé uniquement par drizzle-kit
--   - app_rw      : DML (SELECT/INSERT/UPDATE/DELETE) — utilisé par l'app Next.js au runtime
-- Référence : M1.2 sous-phase A (cf. plan), prépare ADR à venir sur les comptes DB.
--
-- Cette migration est manuelle (SQL natif), pas générée par drizzle-kit.
-- À appliquer une seule fois en superuser (erpbtp) après le premier docker compose up.
-- Idempotent : utilise DO blocks pour ne pas planter si rôles déjà créés.

-- =================================================================
-- 1. Création des rôles
-- =================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator LOGIN PASSWORD 'app_migrator_dev_password';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw LOGIN PASSWORD 'app_rw_dev_password';
  END IF;
END
$$;

-- =================================================================
-- 2. Droits sur la base et le schema
-- =================================================================

GRANT CONNECT ON DATABASE erpbtp TO app_migrator, app_rw;
GRANT USAGE ON SCHEMA public TO app_migrator, app_rw;
GRANT CREATE ON SCHEMA public TO app_migrator;

-- =================================================================
-- 3. Droits sur les objets existants (tables Better Auth + utilisateurs)
-- =================================================================

-- app_migrator : tout sur les tables/séquences/fonctions existantes
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_migrator;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_migrator;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO app_migrator;

-- app_rw : DML uniquement
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_rw;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_rw;

-- =================================================================
-- 4. Droits par défaut sur les objets futurs (M2+)
-- =================================================================
-- Quand app_migrator créera de nouvelles tables/séquences/fonctions,
-- app_rw recevra automatiquement les droits DML correspondants.

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw;

ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO app_rw;

-- =================================================================
-- 5. Vérifications
-- =================================================================
-- Pour tester manuellement :
--   psql -U app_rw -d erpbtp -c "CREATE TABLE x (id int);"
--     -> doit échouer avec permission denied for schema public
--   psql -U app_migrator -d erpbtp -c "CREATE TABLE x (id int); DROP TABLE x;"
--     -> doit réussir
