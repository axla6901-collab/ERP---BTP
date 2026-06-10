-- 0003_audit_log.sql
-- Crée la table audit_log et l'enum audit_action.
-- Schema TypeScript en miroir : db/schema/audit.ts
-- Référence : M1.2 sous-phase B
--
-- Appliqué via app_migrator (DDL).
-- Idempotent : utilise IF NOT EXISTS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audit_action') THEN
    CREATE TYPE audit_action AS ENUM ('insert', 'update', 'delete');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  action audit_action NOT NULL,
  before JSONB,
  after JSONB,
  utilisateur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_row
  ON audit_log (table_name, row_id, created_at DESC);
