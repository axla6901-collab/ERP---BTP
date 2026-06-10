-- 0039_add_entreprise_id_tiers_commercial.sql
-- Ajout de entreprise_id sur tiers (sous-traitants) et commercial (clients, devis, lignes...).
-- Backfill : tables racines → entreprise default ; tables filles → hérité du parent.

BEGIN;

-- ============================ sous_traitants ============================
ALTER TABLE sous_traitants ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE sous_traitants SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE sous_traitants ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sous_traitants_entreprise ON sous_traitants (entreprise_id);

-- ============================ sous_traitant_contacts ============================
ALTER TABLE sous_traitant_contacts ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE sous_traitant_contacts stc
  SET entreprise_id = st.entreprise_id
  FROM sous_traitants st
  WHERE stc.sous_traitant_id = st.id AND stc.entreprise_id IS NULL;
ALTER TABLE sous_traitant_contacts ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sous_traitant_contacts_entreprise ON sous_traitant_contacts (entreprise_id);

-- ============================ clients ============================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE clients SET entreprise_id = (SELECT id FROM entreprises WHERE slug = 'default') WHERE entreprise_id IS NULL;
ALTER TABLE clients ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_entreprise ON clients (entreprise_id);

-- ============================ devis ============================
ALTER TABLE devis ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE devis d
  SET entreprise_id = c.entreprise_id
  FROM clients c
  WHERE d.client_id = c.id AND d.entreprise_id IS NULL;
ALTER TABLE devis ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devis_entreprise ON devis (entreprise_id);

-- ============================ lignes_devis ============================
ALTER TABLE lignes_devis ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE lignes_devis ld
  SET entreprise_id = d.entreprise_id
  FROM devis d
  WHERE ld.devis_id = d.id AND ld.entreprise_id IS NULL;
ALTER TABLE lignes_devis ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lignes_devis_entreprise ON lignes_devis (entreprise_id);

-- ============================ postes_internes_devis ============================
ALTER TABLE postes_internes_devis ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE postes_internes_devis pid
  SET entreprise_id = d.entreprise_id
  FROM devis d
  WHERE pid.devis_id = d.id AND pid.entreprise_id IS NULL;
ALTER TABLE postes_internes_devis ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_postes_internes_devis_entreprise ON postes_internes_devis (entreprise_id);

-- ============================ repartitions_poste_interne ============================
ALTER TABLE repartitions_poste_interne ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE repartitions_poste_interne rpi
  SET entreprise_id = pid.entreprise_id
  FROM postes_internes_devis pid
  WHERE rpi.poste_interne_id = pid.id AND rpi.entreprise_id IS NULL;
ALTER TABLE repartitions_poste_interne ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repartitions_poste_interne_entreprise ON repartitions_poste_interne (entreprise_id);

-- ============================ composants_ligne_devis ============================
ALTER TABLE composants_ligne_devis ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES entreprises(id) ON DELETE RESTRICT;
UPDATE composants_ligne_devis cld
  SET entreprise_id = ld.entreprise_id
  FROM lignes_devis ld
  WHERE cld.ligne_devis_id = ld.id AND cld.entreprise_id IS NULL;
ALTER TABLE composants_ligne_devis ALTER COLUMN entreprise_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_composants_ligne_devis_entreprise ON composants_ligne_devis (entreprise_id);

COMMIT;
