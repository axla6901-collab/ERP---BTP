-- 0061_facturx.sql
-- Facturation électronique Factur-X (EN 16931 = PDF/A-3 + XML CII).
--
-- 1) Champs émetteur manquants sur `entreprises` requis par la facture
--    électronique : IBAN/BIC (moyen de paiement BT-84/BT-85 du XML) et mentions
--    légales françaises du PDF visuel (RCS, forme juridique, capital, code APE).
--    Tous nullables : la complétude est vérifiée À LA GÉNÉRATION (erreur métier
--    explicite), pas en base — on ne casse pas les lignes existantes.
--
-- 2) Table `facture_documents` : archivage légal (10 ans) des PDF Factur-X
--    générés. Calquée sur `documents_tiers` (0059) — binaire en MinIO via
--    `minio_key` (lib/storage/s3.ts), métadonnées + empreinte en base. RLS
--    tenant alignée (cf. 0043/0059).
--
-- Migration idempotente.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) Champs émetteur (entreprises)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS bic TEXT;
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS rcs TEXT;
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS forme_juridique TEXT;
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS capital_social NUMERIC(14, 2);
ALTER TABLE entreprises ADD COLUMN IF NOT EXISTS code_ape TEXT;

-- IBAN : format ISO 13616 (2 lettres pays + 2 clés + ≤30 alphanum), sans espaces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_entreprises_iban_format'
  ) THEN
    ALTER TABLE entreprises ADD CONSTRAINT chk_entreprises_iban_format
      CHECK (iban IS NULL OR iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$');
  END IF;
END $$;

-- Capital social positif si renseigné.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_entreprises_capital_pos'
  ) THEN
    ALTER TABLE entreprises ADD CONSTRAINT chk_entreprises_capital_pos
      CHECK (capital_social IS NULL OR capital_social >= 0);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 2) Archivage des Factur-X générés
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS facture_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  -- Profil Factur-X du fichier (en16931, basic, …) — porté côté app.
  profil TEXT NOT NULL DEFAULT 'en16931',
  -- Fichier (MinIO)
  minio_key TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  taille_bytes BIGINT,
  -- Empreinte SHA-256 (hex) du PDF, pour l'intégrité de l'archive.
  sha256 TEXT,
  -- true si le XML a passé la validation XSD (best-effort ; false si non vérifié).
  xml_valide BOOLEAN NOT NULL DEFAULT false,
  genere_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  -- Soft-delete : un document est « remplacé » (et non écrasé) à chaque
  -- régénération tant que la facture est en brouillon.
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_facture_documents_taille
    CHECK (taille_bytes IS NULL OR taille_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_facture_documents_facture
  ON facture_documents (facture_id, genere_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_facture_documents_entreprise
  ON facture_documents (entreprise_id);

-- RLS tenant : même policy p_tenant que les autres tables scopées (cf. 0043/0059).
ALTER TABLE facture_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE facture_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON facture_documents;
CREATE POLICY p_tenant ON facture_documents
  AS PERMISSIVE
  FOR ALL
  TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON facture_documents TO app_rw;

COMMIT;
