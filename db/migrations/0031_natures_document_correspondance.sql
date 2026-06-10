-- 0031_natures_document_correspondance.sql
-- Référentiel des natures de document administratif + correspondance par
-- corps d'état et nature de tier (FEB_Contrôle Artisans.docx §II).
--
-- Le délai est exprimé en JOURS pour permettre un ajustement fin (docx l.105).
-- Mode de contrôle :
--   - duree_jours          : doc valide pendant N jours après date d'obtention.
--   - date_fin_assurance   : la date d'expiration figure sur le doc (assurances).
--   - case_a_cocher        : présence cochée, pas de date.
--   - date_obtention       : date présente sans expiration (perméabilité).
--
-- Table de correspondance : signifie « ce document est REQUIS pour cette
-- combinaison (corps d'état × nature_tiers) ». Si une ligne est absente, le
-- contrôle ne s'applique pas (cf. docx l.241).

BEGIN;

CREATE TYPE mode_controle_document AS ENUM (
  'duree_jours',
  'date_fin_assurance',
  'case_a_cocher',
  'date_obtention'
);

CREATE TABLE natures_document (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  mode_controle mode_controle_document NOT NULL,
  -- Délai de validité en jours (NULL si mode_controle <> 'duree_jours' ET
  -- mode_controle <> 'date_fin_assurance').
  -- Pour date_fin_assurance, ce champ représente le délai de tolérance après
  -- la date d'expiration mentionnée sur le document (ex: 15 j après).
  delai_validite_jours INTEGER,
  -- Délai de relance avant expiration (en jours). NULL = pas de relance.
  delai_relance_jours INTEGER,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_natures_document_code_format
    CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_natures_document_libelle_len
    CHECK (char_length(libelle) BETWEEN 2 AND 200),
  CONSTRAINT chk_natures_document_delais_positifs
    CHECK (
      (delai_validite_jours IS NULL OR delai_validite_jours >= 0)
      AND (delai_relance_jours IS NULL OR delai_relance_jours >= 0)
    )
);

CREATE UNIQUE INDEX uq_natures_document_code_active
  ON natures_document (code) WHERE deleted_at IS NULL;

CREATE INDEX idx_natures_document_actif
  ON natures_document (actif, ordre_affichage) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_natures_document_updated_at
  BEFORE UPDATE ON natures_document
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Correspondance corps d'état × nature de tier × nature de document.
-- Une ligne signifie « ce document est requis pour cette combinaison ».
-- `est_bloquant=true` : l'agrément ne peut être validé sans ce document valide
-- (cf. docx Table 3 colonne « Bloquant »).
CREATE TABLE corps_etat_documents_requis (
  corps_etat_id UUID NOT NULL REFERENCES corps_etat(id) ON DELETE CASCADE,
  nature_document_id UUID NOT NULL REFERENCES natures_document(id) ON DELETE CASCADE,
  nature_tiers nature_tiers NOT NULL,
  est_bloquant BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  PRIMARY KEY (corps_etat_id, nature_document_id, nature_tiers)
);

CREATE INDEX idx_corps_etat_docs_corps ON corps_etat_documents_requis (corps_etat_id, nature_tiers);
CREATE INDEX idx_corps_etat_docs_doc ON corps_etat_documents_requis (nature_document_id);

CREATE TRIGGER trg_corps_etat_docs_updated_at
  BEFORE UPDATE ON corps_etat_documents_requis
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON
  natures_document, corps_etat_documents_requis
  TO app_rw;

COMMIT;
