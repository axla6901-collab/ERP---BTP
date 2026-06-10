-- 0059_entreprise_tiers_referencement_flag.sql
-- Option « Référencement & Agrément des tiers » activable par entreprise,
-- sur le modèle de planning_active (migration 0053). Le schéma Drizzle
-- (db/schema/entreprises.ts) et le contexte tenant (lib/auth/tenant-guards.ts)
-- référencent déjà cette colonne ; cette migration la matérialise en base.

BEGIN;

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS tiers_referencement_active boolean NOT NULL DEFAULT false;

COMMIT;
