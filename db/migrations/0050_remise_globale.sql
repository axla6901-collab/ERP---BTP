-- 0050_remise_globale.sql
-- Objectif :
--   Ajouter une « remise globale » appliquée directement sur le total HT des
--   documents commerciaux et de facturation (devis, factures, situations).
--   Deux modes :
--     - remise_globale_type = 'pourcent' : pourcentage du total HT (0 < v <= 100)
--     - remise_globale_type = 'montant'  : montant fixe en euros (v > 0)
--   NULL = aucune remise globale (les remises par ligne restent indépendantes).
--
--   Les colonnes total_ht / total_tva / total_ttc / details_tva continuent de
--   stocker les montants NETS (après remise globale ventilée par taux de TVA)
--   pour les devis et factures. Pour situations_travaux, les montants restent
--   bruts (intégrité du cumul d'avancement) ; la remise est appliquée à
--   l'affichage et à la génération de facture.
--
-- À appliquer en tant que app_migrator :
--   docker exec -i -e PGPASSWORD=app_migrator_dev_password erp-btp-postgres \
--     psql -U app_migrator -d erpbtp < db/migrations/0050_remise_globale.sql

BEGIN;

-- =================================================================
-- 1. Devis
-- =================================================================

ALTER TABLE devis ADD COLUMN IF NOT EXISTS remise_globale_type   text;
ALTER TABLE devis ADD COLUMN IF NOT EXISTS remise_globale_valeur numeric(14, 2);

ALTER TABLE devis DROP CONSTRAINT IF EXISTS chk_devis_remise_globale;
ALTER TABLE devis ADD CONSTRAINT chk_devis_remise_globale CHECK (
  remise_globale_type IS NULL
  OR (
    remise_globale_type IN ('pourcent', 'montant')
    AND remise_globale_valeur IS NOT NULL
    AND remise_globale_valeur > 0
    AND (remise_globale_type <> 'pourcent' OR remise_globale_valeur <= 100)
  )
);

-- =================================================================
-- 2. Factures
-- =================================================================

ALTER TABLE factures ADD COLUMN IF NOT EXISTS remise_globale_type   text;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS remise_globale_valeur numeric(14, 2);

ALTER TABLE factures DROP CONSTRAINT IF EXISTS chk_factures_remise_globale;
ALTER TABLE factures ADD CONSTRAINT chk_factures_remise_globale CHECK (
  remise_globale_type IS NULL
  OR (
    remise_globale_type IN ('pourcent', 'montant')
    AND remise_globale_valeur IS NOT NULL
    AND remise_globale_valeur > 0
    AND (remise_globale_type <> 'pourcent' OR remise_globale_valeur <= 100)
  )
);

-- =================================================================
-- 3. Situations de travaux
-- =================================================================

ALTER TABLE situations_travaux ADD COLUMN IF NOT EXISTS remise_globale_type   text;
ALTER TABLE situations_travaux ADD COLUMN IF NOT EXISTS remise_globale_valeur numeric(14, 2);

ALTER TABLE situations_travaux DROP CONSTRAINT IF EXISTS chk_situations_remise_globale;
ALTER TABLE situations_travaux ADD CONSTRAINT chk_situations_remise_globale CHECK (
  remise_globale_type IS NULL
  OR (
    remise_globale_type IN ('pourcent', 'montant')
    AND remise_globale_valeur IS NOT NULL
    AND remise_globale_valeur > 0
    AND (remise_globale_type <> 'pourcent' OR remise_globale_valeur <= 100)
  )
);

COMMIT;
