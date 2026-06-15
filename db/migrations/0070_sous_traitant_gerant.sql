-- 0070_sous_traitant_gerant.sql
-- Module Tiers : nom et prénom du gérant (mandataire social) du sous-traitant.
-- Schéma TypeScript miroir : db/schema/tiers.ts (sousTraitants.gerantNom / gerantPrenom).
-- Validation FR : lib/validation/tiers.ts (sousTraitantSchema).
--
-- Champ d'identification du dirigeant de la société sous-traitante, DISTINCT des
-- contacts opérationnels (table sous_traitant_contacts). Texte libre, optionnel.
-- Idempotente (ADD COLUMN IF NOT EXISTS).

BEGIN;

ALTER TABLE sous_traitants
  ADD COLUMN IF NOT EXISTS gerant_nom text,
  ADD COLUMN IF NOT EXISTS gerant_prenom text;

COMMIT;
