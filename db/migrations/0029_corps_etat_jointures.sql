-- 0029_corps_etat_jointures.sql
-- Référentiel des corps d'état + jointures avec tiers et sociétés.
-- Couvre FEB_Contrôle Artisans.docx §I (Table 3 - corps d'état/documents) et §II
-- (Table 5 - corps d'état × nature × documents requis).
--
-- - corps_etat : référentiel paramétrable (CRUD via /administration/referentiel-tiers).
-- - tier_corps_etat : un tier peut avoir plusieurs activités (cf. docx ligne 154).
-- - tier_societes_autorisees : cloisonnement des tiers visibles selon société.

BEGIN;

CREATE TABLE corps_etat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  ordre_affichage INTEGER NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_corps_etat_code_format
    CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_corps_etat_libelle_len
    CHECK (char_length(libelle) BETWEEN 2 AND 200)
);

CREATE UNIQUE INDEX uq_corps_etat_code_active
  ON corps_etat (code) WHERE deleted_at IS NULL;

CREATE INDEX idx_corps_etat_actif
  ON corps_etat (actif, ordre_affichage) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_corps_etat_updated_at
  BEFORE UPDATE ON corps_etat
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Jointure tier × corps d'état (cardinalité N×M)
CREATE TABLE tier_corps_etat (
  tier_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  corps_etat_id UUID NOT NULL REFERENCES corps_etat(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  PRIMARY KEY (tier_id, corps_etat_id)
);

CREATE INDEX idx_tier_corps_etat_corps ON tier_corps_etat (corps_etat_id);

-- Jointure tier × société autorisée (cloisonnement Table 1 du docx)
CREATE TABLE tier_societes_autorisees (
  tier_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  societe_id UUID NOT NULL REFERENCES societes(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  PRIMARY KEY (tier_id, societe_id)
);

CREATE INDEX idx_tier_societes_societe ON tier_societes_autorisees (societe_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  corps_etat, tier_corps_etat, tier_societes_autorisees
  TO app_rw;

COMMIT;
