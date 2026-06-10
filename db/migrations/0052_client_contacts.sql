-- 0052_client_contacts.sql
-- Contacts multiples par client (module commercial), alignés sur
-- fournisseur_contacts / sous_traitant_contacts :
--   - entreprise_id NOT NULL (RLS multi-tenant) posé dès la création,
--   - soft-delete via deleted_at, flag `actif`,
--   - un seul contact `principal` actif par client (index unique partiel).
-- Schéma TypeScript miroir : db/schema/commercial.ts (clientContacts).
--
-- Contrairement à fournisseur_contacts / sous_traitant_contacts (créés en 0025
-- puis rescopés en 0039), la table naît directement avec entreprise_id.
-- Les fonctions trigger réutilisées existent déjà : trigger_set_updated_at (0002),
-- trg_inherit_entreprise_id (0044). Migration idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  prenom TEXT,
  fonction TEXT,
  email TEXT,
  telephone_mobile TEXT,
  telephone_fixe TEXT,
  notes TEXT,
  principal BOOLEAN NOT NULL DEFAULT false,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_client_contacts_nom_len
    CHECK (char_length(nom) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_client_contacts_client
  ON client_contacts (client_id);

CREATE INDEX IF NOT EXISTS idx_client_contacts_actif
  ON client_contacts (client_id, actif) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_contacts_entreprise
  ON client_contacts (entreprise_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_contacts_principal
  ON client_contacts (client_id)
  WHERE principal = true AND deleted_at IS NULL;

-- updated_at automatique (fonction posée en 0002).
DROP TRIGGER IF EXISTS trg_client_contacts_updated_at ON client_contacts;
CREATE TRIGGER trg_client_contacts_updated_at
  BEFORE UPDATE ON client_contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Propagation / cohérence de entreprise_id depuis le parent (fonction posée en 0044).
DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_client_contacts ON client_contacts;
CREATE TRIGGER trg_inherit_entreprise_id_client_contacts
  BEFORE INSERT ON client_contacts
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('clients', 'client_id');

-- RLS tenant : même policy p_tenant que les autres tables scopées (cf. 0043).
ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON client_contacts;
CREATE POLICY p_tenant ON client_contacts
  AS PERMISSIVE
  FOR ALL
  TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

-- Droits applicatifs (redondant si appliqué par app_migrator via ALTER DEFAULT
-- PRIVILEGES, mais explicite pour rester sûr quel que soit l'applicateur).
GRANT SELECT, INSERT, UPDATE, DELETE ON client_contacts TO app_rw;

COMMIT;
