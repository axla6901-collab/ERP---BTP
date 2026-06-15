-- 0073_raisons_sociales_swap.sql
-- Référentiel central des raisons sociales — ÉTAPE 2/2 (DESTRUCTIVE).
--
-- Passe `raison_sociale_id` en NOT NULL (entités où le nom était obligatoire),
-- réécrit la cohérence type des clients, puis SUPPRIME les colonnes texte :
--   clients.raison_sociale, societes.raison_sociale, fournisseurs.nom, sous_traitants.nom
--
-- ⚠️ PRÉREQUIS ABSOLU — NE PAS APPLIQUER avant que le backfill soit confirmé :
--   1. 0072 appliquée.
--   2. `pnpm tsx scripts/raisons-sociales-backfill.ts` exécuté ET terminé sur
--      « 0 ligne(s) sans raison_sociale_id » (le script lit/écrit via app_admin
--      / BYPASSRLS et sort en erreur s'il reste des lignes à rattacher).
--   Aucun garde-fou SQL ici : app_migrator est soumis au RLS (pas BYPASSRLS),
--   un SELECT de contrôle dans cette session ne verrait aucune ligne tenant.
--
-- Rôle d'application : app_migrator. Idempotence partielle : si les colonnes
-- texte ont déjà été supprimées, ré-exécuter échoue proprement (colonnes absentes).

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. NOT NULL sur les entités où le nom était obligatoire
-- ─────────────────────────────────────────────────────────────
ALTER TABLE fournisseurs   ALTER COLUMN raison_sociale_id SET NOT NULL;
ALTER TABLE sous_traitants ALTER COLUMN raison_sociale_id SET NOT NULL;
ALTER TABLE societes       ALTER COLUMN raison_sociale_id SET NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Clients : cohérence type basée sur la FK (particulier→nom, pro→FK)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE clients DROP CONSTRAINT IF EXISTS chk_clients_type_cohesion;
ALTER TABLE clients ADD CONSTRAINT chk_clients_type_cohesion
  CHECK (
    (type = 'particulier'  AND nom IS NOT NULL)
    OR (type = 'professionnel' AND raison_sociale_id IS NOT NULL)
  );

-- ─────────────────────────────────────────────────────────────
-- 3. Suppression des colonnes texte (et de leurs contraintes)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE societes DROP CONSTRAINT IF EXISTS chk_societes_raison_len;

ALTER TABLE clients        DROP COLUMN IF EXISTS raison_sociale;
ALTER TABLE societes       DROP COLUMN IF EXISTS raison_sociale;
ALTER TABLE fournisseurs   DROP COLUMN IF EXISTS nom;
ALTER TABLE sous_traitants DROP COLUMN IF EXISTS nom;

COMMIT;
