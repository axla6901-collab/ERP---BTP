-- 0026_composants_libres.sql
-- Étend composants_ligne_devis pour permettre des composants « libres »
-- (désignation saisie à la main, sans référence au catalogue articles).
--
-- Schéma TypeScript miroir : db/schema/commercial.ts
-- Idempotente.

ALTER TABLE composants_ligne_devis
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'article_catalogue';

ALTER TABLE composants_ligne_devis
  ADD COLUMN IF NOT EXISTS designation TEXT;

-- article_id devient nullable (requis seulement pour type=article_catalogue).
ALTER TABLE composants_ligne_devis
  ALTER COLUMN article_id DROP NOT NULL;

-- Cohérence par type :
--   article_catalogue → article_id NOT NULL, designation NULL
--   libre             → article_id NULL,     designation NOT NULL
ALTER TABLE composants_ligne_devis
  DROP CONSTRAINT IF EXISTS chk_composants_type_coherence;
ALTER TABLE composants_ligne_devis
  ADD CONSTRAINT chk_composants_type_coherence CHECK (
    (type = 'article_catalogue' AND article_id IS NOT NULL AND designation IS NULL)
    OR
    (type = 'libre' AND article_id IS NULL AND designation IS NOT NULL AND length(trim(designation)) > 0)
  );
