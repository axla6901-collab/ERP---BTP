-- 0036_ligne_devis_origine_dpgf.sql
-- Ajoute un flag `origine_dpgf` sur les lignes de devis pour distinguer les
-- sections / lignes issues d'un import DPGF de celles créées manuellement.
-- Seules les sections créées manuellement sont supprimables côté éditeur.
--
-- Schéma TypeScript miroir : db/schema/commercial.ts
-- Idempotente.

ALTER TABLE lignes_devis
  ADD COLUMN IF NOT EXISTS origine_dpgf BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_lignes_devis_origine_dpgf
  ON lignes_devis (devis_id, origine_dpgf)
  WHERE origine_dpgf = TRUE;
