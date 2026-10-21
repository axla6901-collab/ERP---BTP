-- 0079_test_sirh_flag.sql
-- Feature flag du module « Test SIRH » (option par entreprise).
-- Basculable par l'admin tenant (cf. lib/test-sirh/activation.ts) ; l'activation
-- amorce les référentiels par défaut (types d'absence, horaires, dossiers GED,
-- jours fériés, modèles d'onboarding, formations réglementaires BTP).
-- Migration idempotente.

BEGIN;

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS test_sirh_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN entreprises.test_sirh_active IS
  'Active le module Test SIRH (organisation, contrats, absences, temps, paie, frais, recrutement, entretiens, formation, onboarding…). Basculable par l''admin tenant.';

COMMIT;
