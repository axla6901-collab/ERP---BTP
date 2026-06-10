-- 0025_tiers_adresse_contacts.sql
-- Ajoute une adresse postale + une liste de contacts (actif/inactif) sur les tiers.
-- Schémas TypeScript miroirs : db/schema/catalogue.ts (fournisseurs) et db/schema/tiers.ts (sous_traitants).
--
-- - Adresse : 5 colonnes nullables (sauf `pays` default 'France'), pattern identique à chantiers/employes.
-- - Contacts : 2 tables dédiées (fournisseur_contacts, sous_traitant_contacts) avec
--     soft-delete, flag `actif`, flag `principal` (max 1 actif par tiers via index unique partiel).
--
-- Migration idempotente, rétrocompatible (colonnes nullables, nouvelles tables vides).

-- ─────────────────────────────────────────────────────────────
-- Adresse sur fournisseurs
-- ─────────────────────────────────────────────────────────────

ALTER TABLE fournisseurs
  ADD COLUMN IF NOT EXISTS adresse_ligne1 TEXT,
  ADD COLUMN IF NOT EXISTS adresse_ligne2 TEXT,
  ADD COLUMN IF NOT EXISTS code_postal TEXT,
  ADD COLUMN IF NOT EXISTS ville TEXT,
  ADD COLUMN IF NOT EXISTS pays TEXT NOT NULL DEFAULT 'France';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_fournisseurs_cp'
  ) THEN
    ALTER TABLE fournisseurs
      ADD CONSTRAINT chk_fournisseurs_cp
      CHECK (code_postal IS NULL OR code_postal ~ '^[0-9]{5}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fournisseurs_ville
  ON fournisseurs (ville) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Adresse sur sous_traitants
-- ─────────────────────────────────────────────────────────────

ALTER TABLE sous_traitants
  ADD COLUMN IF NOT EXISTS adresse_ligne1 TEXT,
  ADD COLUMN IF NOT EXISTS adresse_ligne2 TEXT,
  ADD COLUMN IF NOT EXISTS code_postal TEXT,
  ADD COLUMN IF NOT EXISTS ville TEXT,
  ADD COLUMN IF NOT EXISTS pays TEXT NOT NULL DEFAULT 'France';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sous_traitants_cp'
  ) THEN
    ALTER TABLE sous_traitants
      ADD CONSTRAINT chk_sous_traitants_cp
      CHECK (code_postal IS NULL OR code_postal ~ '^[0-9]{5}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sous_traitants_ville
  ON sous_traitants (ville) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- Contacts des fournisseurs
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fournisseur_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fournisseur_id UUID NOT NULL REFERENCES fournisseurs(id) ON DELETE CASCADE,
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
  CONSTRAINT chk_fournisseur_contacts_nom_len
    CHECK (char_length(nom) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_fournisseur_contacts_fournisseur
  ON fournisseur_contacts (fournisseur_id);

CREATE INDEX IF NOT EXISTS idx_fournisseur_contacts_actif
  ON fournisseur_contacts (fournisseur_id, actif) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fournisseur_contacts_principal
  ON fournisseur_contacts (fournisseur_id)
  WHERE principal = true AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_fournisseur_contacts_updated_at ON fournisseur_contacts;
CREATE TRIGGER trg_fournisseur_contacts_updated_at
  BEFORE UPDATE ON fournisseur_contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Contacts des sous-traitants
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sous_traitant_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sous_traitant_id UUID NOT NULL REFERENCES sous_traitants(id) ON DELETE CASCADE,
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
  CONSTRAINT chk_sous_traitant_contacts_nom_len
    CHECK (char_length(nom) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_sous_traitant_contacts_sous_traitant
  ON sous_traitant_contacts (sous_traitant_id);

CREATE INDEX IF NOT EXISTS idx_sous_traitant_contacts_actif
  ON sous_traitant_contacts (sous_traitant_id, actif) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sous_traitant_contacts_principal
  ON sous_traitant_contacts (sous_traitant_id)
  WHERE principal = true AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_sous_traitant_contacts_updated_at ON sous_traitant_contacts;
CREATE TRIGGER trg_sous_traitant_contacts_updated_at
  BEFORE UPDATE ON sous_traitant_contacts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
