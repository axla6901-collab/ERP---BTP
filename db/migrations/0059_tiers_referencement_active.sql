-- 0059_tiers_referencement_active.sql
-- Active le module complémentaire « Référencement & Agrément des tiers » par
-- entreprise (même patron que `planning_active`, migration 0053).
--
-- Le flag conditionne :
--   - l'affichage de l'entrée de menu Tiers ▸ Référencement (sidebar) ;
--   - l'accès aux pages /tiers/referencement (notFound() si désactivé).
-- Les tables du module (0028-0033, 0058) et les permissions RBAC (0033)
-- préexistent ; ce flag ne fait qu'ouvrir/fermer l'accès applicatif.

BEGIN;

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS tiers_referencement_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN entreprises.tiers_referencement_active IS
  'Active le module complémentaire Référencement & Agrément des tiers '
  '(suivi documentaire, agrément, relances). Bascule par l''admin tenant.';

COMMIT;
