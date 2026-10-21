-- =================================================================
-- 0081 — Codes postaux étrangers pour les fournisseurs et sous-traitants.
--
-- Jusqu'ici `chk_fournisseurs_cp` / `chk_sous_traitants_cp` (0025) imposaient
-- 5 chiffres quel que soit le pays : impossible d'enregistrer un fournisseur
-- suisse (1200), belge (4000) ou britannique (SW1A 1AA).
--
-- Nouvelle règle, identique pour les deux tables :
--   - adresse en France (pays 'France' / 'FR' / 'FRA', casse et espaces
--     ignorés) : 5 chiffres, comme avant ;
--   - ailleurs : 2 à 10 caractères alphanumériques, espaces et tirets admis.
-- Miroir applicatif : `lib/validation/tiers.ts` (verifierCodePostalSelonPays)
-- et `lib/geo/pays.ts` (estPaysFrance).
--
-- Les lignes existantes (pays 'France' + 5 chiffres, ou code postal NULL)
-- respectent la nouvelle règle : la validation des contraintes passe.
-- Idempotent. Appliquer en app_migrator (propriétaire des tables).
-- =================================================================

BEGIN;

ALTER TABLE fournisseurs DROP CONSTRAINT IF EXISTS chk_fournisseurs_cp;
ALTER TABLE fournisseurs ADD CONSTRAINT chk_fournisseurs_cp CHECK (
  code_postal IS NULL
  OR (lower(btrim(pays)) IN ('france', 'fr', 'fra') AND code_postal ~ '^[0-9]{5}$')
  OR (lower(btrim(pays)) NOT IN ('france', 'fr', 'fra')
      AND code_postal ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$')
);

ALTER TABLE sous_traitants DROP CONSTRAINT IF EXISTS chk_sous_traitants_cp;
ALTER TABLE sous_traitants ADD CONSTRAINT chk_sous_traitants_cp CHECK (
  code_postal IS NULL
  OR (lower(btrim(pays)) IN ('france', 'fr', 'fra') AND code_postal ~ '^[0-9]{5}$')
  OR (lower(btrim(pays)) NOT IN ('france', 'fr', 'fra')
      AND code_postal ~ '^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$')
);

COMMIT;
