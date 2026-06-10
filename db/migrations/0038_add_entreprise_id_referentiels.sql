-- 0038_add_entreprise_id_referentiels.sql
-- Ajout de entreprise_id sur les tables du catalogue (sauf unites et unite_conversions
-- qui restent référentiels SI universels, partagés entre toutes les entreprises).
--
-- Stratégie : pour chaque table, ADD COLUMN nullable -> UPDATE backfill 'default'
-- -> SET NOT NULL -> CREATE INDEX. Tout sous transaction unique.
--
-- À appliquer en tant que app_migrator (BYPASSRLS implicite, donc UPDATE traverse tout).

BEGIN;

-- ----- Helper interne : récupère l'id de l'entreprise default -----
-- (on l'inline via SELECT à chaque UPDATE — pas besoin de variable globale)

-- ============================ familles ============================
ALTER TABLE familles ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE familles SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE familles ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_familles_entreprise ON familles (entreprise_id);

-- ============================ articles ============================
ALTER TABLE articles ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE articles SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE articles ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_entreprise ON articles (entreprise_id);

-- ============================ fournisseurs ============================
ALTER TABLE fournisseurs ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE fournisseurs SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE fournisseurs ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fournisseurs_entreprise ON fournisseurs (entreprise_id);

-- ============================ fournisseur_contacts ============================
ALTER TABLE fournisseur_contacts ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE fournisseur_contacts fc
  SET entreprise_id = f.entreprise_id
  FROM fournisseurs f
  WHERE fc.fournisseur_id = f.id AND fc.entreprise_id IS NULL;
ALTER TABLE fournisseur_contacts ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fournisseur_contacts_entreprise ON fournisseur_contacts (entreprise_id);

-- ============================ nomenclatures ============================
ALTER TABLE nomenclatures ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE nomenclatures n
  SET entreprise_id = a.entreprise_id
  FROM articles a
  WHERE n.article_id = a.id AND n.entreprise_id IS NULL;
ALTER TABLE nomenclatures ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nomenclatures_entreprise ON nomenclatures (entreprise_id);

-- ============================ nomenclature_lignes ============================
ALTER TABLE nomenclature_lignes ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE nomenclature_lignes nl
  SET entreprise_id = n.entreprise_id
  FROM nomenclatures n
  WHERE nl.nomenclature_id = n.id AND nl.entreprise_id IS NULL;
ALTER TABLE nomenclature_lignes ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nomenclature_lignes_entreprise ON nomenclature_lignes (entreprise_id);

-- ============================ prix_articles ============================
ALTER TABLE prix_articles ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE prix_articles pa
  SET entreprise_id = a.entreprise_id
  FROM articles a
  WHERE pa.article_id = a.id AND pa.entreprise_id IS NULL;
ALTER TABLE prix_articles ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prix_articles_entreprise ON prix_articles (entreprise_id);

-- ============================ grilles_tarifaires ============================
ALTER TABLE grilles_tarifaires ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE grilles_tarifaires SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE grilles_tarifaires ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grilles_tarifaires_entreprise ON grilles_tarifaires (entreprise_id);

-- ============================ grille_tarifaire_lignes ============================
ALTER TABLE grille_tarifaire_lignes ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE grille_tarifaire_lignes gtl
  SET entreprise_id = gt.entreprise_id
  FROM grilles_tarifaires gt
  WHERE gtl.grille_id = gt.id AND gtl.entreprise_id IS NULL;
ALTER TABLE grille_tarifaire_lignes ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grille_tarifaire_lignes_entreprise ON grille_tarifaire_lignes (entreprise_id);

COMMIT;
