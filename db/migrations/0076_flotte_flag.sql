-- 0076_flotte_flag.sql
-- Feature flag du module Flotte automobile (option par entreprise).
-- Basculable par l'admin tenant (cf. lib/flotte/activation.ts).
-- Migration idempotente.

BEGIN;

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS flotte_automobile_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN entreprises.flotte_automobile_active IS
  'Active le module Flotte automobile (parc véhicules, échéances, entretiens…). Basculable par l''admin tenant.';

COMMIT;
