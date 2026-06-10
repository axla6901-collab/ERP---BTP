-- 0067_chiffrement_champs_sensibles_prep.sql
-- Audit sécurité B1 — chiffrement applicatif des champs sensibles (RGPD).
-- Schéma TypeScript miroir : db/schema/employes.ts + db/schema/entreprises.ts
-- (colonnes passées en type Drizzle `encryptedText`, stockage `bytea`).
--
-- ÉTAPE 1/2 (préparation, NON destructive) :
--   1. Retire les CHECK regex devenus incompatibles avec le chiffrement
--      (le motif ne s'applique pas à un bytea). La validation de format est
--      désormais 100 % applicative (Zod — lib/validation/rh.ts).
--   2. Ajoute les colonnes chiffrées `*_enc` (bytea) EN PARALLÈLE des colonnes
--      en clair, qui restent intactes le temps du backfill.
--
-- Ordre d'application (cf. docs/runbooks/chiffrement-champs-sensibles.md) :
--   a) appliquer 0067 (app_migrator)
--   b) exécuter scripts/encrypt-sensitive-backfill.ts (app_admin / BYPASSRLS)
--   c) appliquer 0068 (swap + rename), seulement après backfill confirmé
--
-- Rôle d'application : app_migrator. Migration idempotente.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) Suppression des CHECK regex (numero_secu, iban employés + entreprise)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employes DROP CONSTRAINT IF EXISTS chk_employes_numero_secu;
ALTER TABLE employes DROP CONSTRAINT IF EXISTS chk_employes_iban_format;
ALTER TABLE entreprises DROP CONSTRAINT IF EXISTS chk_entreprises_iban_format;

-- ─────────────────────────────────────────────────────────────
-- 2) Colonnes chiffrées (bytea), nullables, en parallèle du clair
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS numero_secu_enc           bytea,
  ADD COLUMN IF NOT EXISTS iban_enc                  bytea,
  ADD COLUMN IF NOT EXISTS bic_enc                   bytea,
  ADD COLUMN IF NOT EXISTS salaire_mensuel_brut_enc  bytea,
  ADD COLUMN IF NOT EXISTS taux_horaire_brut_enc     bytea;

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS iban_enc bytea,
  ADD COLUMN IF NOT EXISTS bic_enc  bytea;

COMMIT;
