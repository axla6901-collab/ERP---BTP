-- 0028_composant_libre_tva_remise.sql
-- Ajoute TVA et remise optionnelles sur les composants de ligne de devis :
-- - Renseignés uniquement pour les composants `libre` (override de la ligne parente).
-- - NULL pour les composants `article_catalogue` (hérite toujours de la ligne).
--
-- Schéma TypeScript miroir : db/schema/commercial.ts
-- Sémantique calcul : lib/commercial/calculs.ts (override per-composant)
-- Idempotente.

ALTER TABLE composants_ligne_devis
  ADD COLUMN IF NOT EXISTS taux_tva NUMERIC(5, 2);

ALTER TABLE composants_ligne_devis
  ADD COLUMN IF NOT EXISTS remise_pourcent NUMERIC(5, 2);

ALTER TABLE composants_ligne_devis
  DROP CONSTRAINT IF EXISTS chk_composants_tva_libre_only;
ALTER TABLE composants_ligne_devis
  ADD CONSTRAINT chk_composants_tva_libre_only CHECK (
    type = 'libre' OR taux_tva IS NULL
  );

ALTER TABLE composants_ligne_devis
  DROP CONSTRAINT IF EXISTS chk_composants_remise_libre_only;
ALTER TABLE composants_ligne_devis
  ADD CONSTRAINT chk_composants_remise_libre_only CHECK (
    type = 'libre' OR remise_pourcent IS NULL
  );

ALTER TABLE composants_ligne_devis
  DROP CONSTRAINT IF EXISTS chk_composants_taux_tva_range;
ALTER TABLE composants_ligne_devis
  ADD CONSTRAINT chk_composants_taux_tva_range CHECK (
    taux_tva IS NULL OR (taux_tva >= 0 AND taux_tva <= 100)
  );

ALTER TABLE composants_ligne_devis
  DROP CONSTRAINT IF EXISTS chk_composants_remise_range;
ALTER TABLE composants_ligne_devis
  ADD CONSTRAINT chk_composants_remise_range CHECK (
    remise_pourcent IS NULL OR (remise_pourcent >= 0 AND remise_pourcent <= 100)
  );
