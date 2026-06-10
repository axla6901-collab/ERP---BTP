-- 0040_add_entreprise_id_chantiers_rh.sql
-- Ajout de entreprise_id sur chantiers, chantier_taches, employes + sous-tables, pointages.
-- Backfill : tables racines (chantiers, employes) → default ; filles → hérité.

BEGIN;

-- ============================ chantiers ============================
ALTER TABLE chantiers ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE chantiers SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE chantiers ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chantiers_entreprise ON chantiers (entreprise_id);

-- ============================ chantier_taches ============================
ALTER TABLE chantier_taches ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE chantier_taches ct
  SET entreprise_id = c.entreprise_id
  FROM chantiers c
  WHERE ct.chantier_id = c.id AND ct.entreprise_id IS NULL;
ALTER TABLE chantier_taches ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chantier_taches_entreprise ON chantier_taches (entreprise_id);

-- ============================ employes ============================
ALTER TABLE employes ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE employes SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE employes ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employes_entreprise ON employes (entreprise_id);

-- ============================ employe_habilitations ============================
ALTER TABLE employe_habilitations ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE employe_habilitations eh
  SET entreprise_id = e.entreprise_id
  FROM employes e
  WHERE eh.employe_id = e.id AND eh.entreprise_id IS NULL;
ALTER TABLE employe_habilitations ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employe_habilitations_entreprise ON employe_habilitations (entreprise_id);

-- ============================ employe_permis ============================
ALTER TABLE employe_permis ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE employe_permis ep
  SET entreprise_id = e.entreprise_id
  FROM employes e
  WHERE ep.employe_id = e.id AND ep.entreprise_id IS NULL;
ALTER TABLE employe_permis ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employe_permis_entreprise ON employe_permis (entreprise_id);

-- ============================ employe_documents ============================
ALTER TABLE employe_documents ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE employe_documents ed
  SET entreprise_id = e.entreprise_id
  FROM employes e
  WHERE ed.employe_id = e.id AND ed.entreprise_id IS NULL;
ALTER TABLE employe_documents ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_employe_documents_entreprise ON employe_documents (entreprise_id);

-- ============================ pointages ============================
ALTER TABLE pointages ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE pointages p
  SET entreprise_id = e.entreprise_id
  FROM employes e
  WHERE p.employe_id = e.id AND p.entreprise_id IS NULL;
ALTER TABLE pointages ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pointages_entreprise ON pointages (entreprise_id);

COMMIT;
