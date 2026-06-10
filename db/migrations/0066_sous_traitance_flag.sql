-- 0066_sous_traitance_flag.sql
-- M8 — Feature flag d'activation du module Sous-traitance par entreprise.
-- Schéma TypeScript miroir : db/schema/entreprises.ts (entreprises.sousTraitanceActive).
--
-- Même pattern que planning_active (0053) et tiers_referencement_active (0059) :
-- colonne booléenne lue par lib/auth/tenant-guards.ts, injectée dans
-- AppSidebar (features['sous-traitance']) et gardée par notFound() côté pages.
-- Les fiches sous-traitants (module Tiers) restent visibles ; ce flag pilote
-- l'accès aux Contrats ST et Factures ST.

BEGIN;

ALTER TABLE entreprises
  ADD COLUMN IF NOT EXISTS sous_traitance_active BOOLEAN NOT NULL DEFAULT false;

COMMIT;
