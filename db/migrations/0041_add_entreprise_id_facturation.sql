-- 0041_add_entreprise_id_facturation.sql
-- Ajout de entreprise_id sur facturation (factures, lignes, situations) + numerotation + audit_log.
-- audit_log.entreprise_id est NULLABLE (les entrées d'audit super-admin n'appartiennent à
-- aucune entreprise spécifique ; les entrées historiques M0 restent NULL).

BEGIN;

-- ============================ factures ============================
ALTER TABLE factures ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE factures f
  SET entreprise_id = c.entreprise_id
  FROM clients c
  WHERE f.client_id = c.id AND f.entreprise_id IS NULL;
ALTER TABLE factures ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_factures_entreprise ON factures (entreprise_id);

-- ============================ lignes_facture ============================
ALTER TABLE lignes_facture ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE lignes_facture lf
  SET entreprise_id = f.entreprise_id
  FROM factures f
  WHERE lf.facture_id = f.id AND lf.entreprise_id IS NULL;
ALTER TABLE lignes_facture ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lignes_facture_entreprise ON lignes_facture (entreprise_id);

-- ============================ situations_travaux ============================
ALTER TABLE situations_travaux ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE situations_travaux st
  SET entreprise_id = c.entreprise_id
  FROM chantiers c
  WHERE st.chantier_id = c.id AND st.entreprise_id IS NULL;
ALTER TABLE situations_travaux ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_situations_travaux_entreprise ON situations_travaux (entreprise_id);

-- ============================ lignes_situation ============================
ALTER TABLE lignes_situation ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE lignes_situation ls
  SET entreprise_id = st.entreprise_id
  FROM situations_travaux st
  WHERE ls.situation_id = st.id AND ls.entreprise_id IS NULL;
ALTER TABLE lignes_situation ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lignes_situation_entreprise ON lignes_situation (entreprise_id);

-- ============================ numeros_attribues ============================
-- Les séquences de numérotation deviennent per-entreprise.
-- Les entrées historiques sont rattachées à default.
ALTER TABLE numeros_attribues ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE numeros_attribues SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE numeros_attribues ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_numeros_attribues_entreprise ON numeros_attribues (entreprise_id);

-- ============================ audit_log ============================
-- NULLABLE : permet aux actions super-admin (provisioning, etc.) de ne pas
-- être rattachées à une entreprise spécifique. Les entrées historiques restent NULL.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_audit_log_entreprise ON audit_log (entreprise_id) WHERE entreprise_id IS NOT NULL;

COMMIT;
