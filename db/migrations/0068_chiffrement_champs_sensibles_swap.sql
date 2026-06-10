-- 0068_chiffrement_champs_sensibles_swap.sql
-- Audit sécurité B1 — chiffrement applicatif des champs sensibles (RGPD).
--
-- ÉTAPE 2/2 (DESTRUCTIVE) : supprime les colonnes en clair et renomme les
-- colonnes chiffrées `*_enc` → nom final. À l'issue, le schéma SQL correspond
-- exactement aux schémas Drizzle (employes / entreprises : colonnes `bytea`).
--
-- ⚠️ PRÉREQUIS ABSOLU — NE PAS APPLIQUER avant que le backfill soit confirmé :
--   1. 0067 appliqué
--   2. `pnpm tsx scripts/encrypt-sensitive-backfill.ts` exécuté ET terminé sur
--      « 0 valeur(s) en clair restante(s) » (le script lit toutes les lignes via
--      app_admin/BYPASSRLS et sort en erreur si du clair n'est pas chiffré).
--      Aucun garde-fou SQL ici : app_migrator est soumis au RLS (pas BYPASSRLS),
--      un SELECT de contrôle dans cette session ne verrait aucune ligne tenant.
--   3. DATA_ENCRYPTION_KEYS / DATA_ENCRYPTION_ACTIVE_KEY_ID déployés sur l'app
--      (sinon toute lecture employé/entreprise échouera après le swap).
--
-- Rôle d'application : app_migrator. Idempotence partielle : si les colonnes en
-- clair ont déjà été supprimées, ré-exécuter échoue proprement (colonnes absentes).

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- employes : drop clair → rename chiffré
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employes
  DROP COLUMN IF EXISTS numero_secu,
  DROP COLUMN IF EXISTS iban,
  DROP COLUMN IF EXISTS bic,
  DROP COLUMN IF EXISTS salaire_mensuel_brut,
  DROP COLUMN IF EXISTS taux_horaire_brut;

ALTER TABLE employes RENAME COLUMN numero_secu_enc          TO numero_secu;
ALTER TABLE employes RENAME COLUMN iban_enc                 TO iban;
ALTER TABLE employes RENAME COLUMN bic_enc                  TO bic;
ALTER TABLE employes RENAME COLUMN salaire_mensuel_brut_enc TO salaire_mensuel_brut;
ALTER TABLE employes RENAME COLUMN taux_horaire_brut_enc    TO taux_horaire_brut;

-- ─────────────────────────────────────────────────────────────
-- entreprises : drop clair → rename chiffré
-- ─────────────────────────────────────────────────────────────
ALTER TABLE entreprises
  DROP COLUMN IF EXISTS iban,
  DROP COLUMN IF EXISTS bic;

ALTER TABLE entreprises RENAME COLUMN iban_enc TO iban;
ALTER TABLE entreprises RENAME COLUMN bic_enc  TO bic;

COMMIT;
