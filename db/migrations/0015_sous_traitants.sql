-- 0015_sous_traitants.sql
-- Module Tiers : table sous_traitants.
-- Schéma TypeScript miroir : db/schema/tiers.ts
--
-- Conforme aux exigences légales BTP (loi 75-1334) :
--   - identification (SIRET, n° TVA intracommunautaire)
--   - assurance décennale (n° police + date d'expiration)
--   - agrément DC4 (acceptation conditions de paiement direct)
--   - attestation URSSAF/vigilance (date de la dernière fournie)
--   - qualifications (Qualibat, RGE, etc. — JSONB array de strings)
--
-- Soft delete + audit complet (créateur, modificateur, dates).

CREATE TABLE IF NOT EXISTS sous_traitants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  siret TEXT,
  n_tva_intra TEXT,
  email TEXT,
  telephone TEXT,
  assurance_decennale_num TEXT,
  assurance_decennale_date_fin DATE,
  qualifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  agrement_dc4 BOOLEAN NOT NULL DEFAULT false,
  date_attestation_urssaf DATE,
  actif BOOLEAN NOT NULL DEFAULT true,
  date_sortie DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_sous_traitants_code_format
    CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_sous_traitants_nom_len
    CHECK (char_length(nom) BETWEEN 2 AND 200),
  CONSTRAINT chk_sous_traitants_siret
    CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$'),
  CONSTRAINT chk_sous_traitants_tva_intra
    CHECK (n_tva_intra IS NULL OR n_tva_intra ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'),
  CONSTRAINT chk_sous_traitants_qualifications_array
    CHECK (jsonb_typeof(qualifications) = 'array'),
  CONSTRAINT chk_sous_traitants_actif_date
    CHECK ((actif = true AND date_sortie IS NULL) OR (actif = false AND date_sortie IS NOT NULL))
);

-- Code unique parmi les non-supprimés (autorise réutilisation après soft delete)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sous_traitants_code_active
  ON sous_traitants (code) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sous_traitants_siret_active
  ON sous_traitants (siret) WHERE deleted_at IS NULL AND siret IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sous_traitants_actif
  ON sous_traitants (actif) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_sous_traitants_updated_at ON sous_traitants;
CREATE TRIGGER trg_sous_traitants_updated_at
  BEFORE UPDATE ON sous_traitants
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
