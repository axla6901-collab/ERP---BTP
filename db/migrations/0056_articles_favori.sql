-- 0056_articles_favori.sql
-- Ajoute un indicateur « favori » sur les articles (catalogue), au niveau
-- entreprise : marque les références fréquemment utilisées pour les remonter en
-- tête de liste (étoile dans le catalogue, cf. maquette 07-catalogue).
--
-- Colonne booléenne NOT NULL DEFAULT false. Les GRANT table-level existants sur
-- `articles` (app_rw) couvrent la nouvelle colonne ; la RLS reste active (pas de
-- ré-enable). Migration idempotente (ADD COLUMN IF NOT EXISTS).
--
-- Index partiel sur favori = true : accélère le filtre « favoris uniquement » et
-- la priorisation, sans peser sur la majorité des lignes (non favorites).

BEGIN;

ALTER TABLE articles ADD COLUMN IF NOT EXISTS favori boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_articles_favori ON articles (favori) WHERE favori = true;

COMMIT;
