-- 0021_situation_devis.sql
-- Workflow métier BTP : une situation d'avancement repose sur un devis
-- accepté du chantier. Les lignes du devis deviennent les postes initiaux
-- de la situation, avec un % d'avancement à saisir par poste.
--
-- Schéma TypeScript miroir : db/schema/facturation.ts (situationsTravaux.devisId).
-- Lien optionnel (la saisie manuelle / import xlsx reste possible).
-- Idempotent.

ALTER TABLE situations_travaux
  ADD COLUMN IF NOT EXISTS devis_id UUID REFERENCES devis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_situations_devis
  ON situations_travaux (devis_id)
  WHERE devis_id IS NOT NULL;
