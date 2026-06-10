-- 0059_documents_tiers.sql
-- Documents administratifs importés rattachés à un tiers (sous-traitant ou
-- fournisseur) : K-BIS, attestation de vigilance URSSAF, assurance décennale,
-- RC pro, attestation fiscale/sociale, RIB, qualifications…
--
-- Approche pragmatique (cf. décision 2026-06-10) : table dédiée et générique,
-- calquée sur `employe_documents` (migration 0013) — stockage du fichier en
-- MinIO via `minio_key` (lib/storage/s3.ts), métadonnées + date de validité
-- en base. Le propriétaire est l'une OU l'autre des deux tables historiques
-- (sous_traitants / fournisseurs), via deux FK nullables + CHECK « exactement
-- un propriétaire ». On NE passe PAS par le registre `tiers` (module agrément
-- non câblé). RLS tenant alignée sur les autres tables scopées (cf. 0043/0058).
--
-- Migration idempotente.

BEGIN;

-- Type de document (libellés portés côté app : lib/validation/tiers.ts).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_document_tier') THEN
    CREATE TYPE type_document_tier AS ENUM (
      'kbis',                          -- Extrait K-BIS
      'attestation_urssaf',            -- Attestation de vigilance URSSAF
      'assurance_decennale',           -- Attestation d'assurance décennale
      'assurance_rc_pro',              -- Attestation RC professionnelle
      'attestation_fiscale',           -- Attestation de régularité fiscale
      'attestation_regularite_sociale',-- Attestation de régularité sociale
      'liste_salaries_etrangers',      -- Liste nominative des salariés étrangers
      'qualification',                 -- Qualibat, RGE, certification…
      'contrat_sous_traitance',        -- Contrat / acte de sous-traitance signé
      'rib',                           -- RIB
      'autre'                          -- Autre
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS documents_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  -- Propriétaire : exactement l'un des deux (cf. CHECK plus bas).
  sous_traitant_id UUID REFERENCES sous_traitants(id) ON DELETE CASCADE,
  fournisseur_id UUID REFERENCES fournisseurs(id) ON DELETE CASCADE,
  -- Métadonnées du document
  type type_document_tier NOT NULL DEFAULT 'autre',
  libelle TEXT NOT NULL,
  -- Fichier (MinIO)
  minio_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  taille_bytes BIGINT,
  -- Date de fin de validité (saisie : ex. expiration assurance / attestation).
  date_validite DATE,
  notes TEXT,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_documents_tiers_proprietaire_unique CHECK (
    (sous_traitant_id IS NOT NULL)::int + (fournisseur_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT chk_documents_tiers_libelle_len
    CHECK (char_length(libelle) BETWEEN 1 AND 200),
  CONSTRAINT chk_documents_tiers_taille
    CHECK (taille_bytes IS NULL OR taille_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_documents_tiers_sous_traitant
  ON documents_tiers (sous_traitant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tiers_fournisseur
  ON documents_tiers (fournisseur_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_tiers_entreprise
  ON documents_tiers (entreprise_id);
CREATE INDEX IF NOT EXISTS idx_documents_tiers_validite
  ON documents_tiers (date_validite) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_documents_tiers_updated_at ON documents_tiers;
CREATE TRIGGER trg_documents_tiers_updated_at
  BEFORE UPDATE ON documents_tiers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- RLS tenant : même policy p_tenant que les autres tables scopées (cf. 0043).
ALTER TABLE documents_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents_tiers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON documents_tiers;
CREATE POLICY p_tenant ON documents_tiers
  AS PERMISSIVE
  FOR ALL
  TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON documents_tiers TO app_rw;

COMMIT;
