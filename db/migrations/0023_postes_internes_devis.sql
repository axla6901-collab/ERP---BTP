-- 0023_postes_internes_devis.sql
-- Postes internes ventilés sur les lignes du devis.
--
-- Cas d'usage métier BTP : l'entreprise ajoute des coûts qui doivent rester
-- invisibles pour le client (frais généraux, aléas, marge…). Le montant HT
-- du poste interne est réparti sur les lignes visibles du devis (ou d'un
-- chapitre précis) via des poids paramétrables. Le PU « nu » des lignes
-- reste en base ; le PU effectif (PU + apport ventilé / qté) est calculé
-- à l'affichage et utilisé pour les totaux clients et les situations.
--
-- Schéma TypeScript miroir : db/schema/commercial.ts
-- Idempotente.
--
-- ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'portee_poste_interne') THEN
    CREATE TYPE portee_poste_interne AS ENUM ('devis', 'chapitre');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS postes_internes_devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id UUID NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  libelle TEXT NOT NULL,
  montant_ht NUMERIC(14, 2) NOT NULL,
  portee portee_poste_interne NOT NULL,
  /** Ligne de devis de type 'section' qui délimite la portée si portee='chapitre'. */
  chapitre_ligne_id UUID REFERENCES lignes_devis(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_postes_internes_montant_pos CHECK (montant_ht > 0),
  CONSTRAINT chk_postes_internes_libelle CHECK (length(trim(libelle)) > 0),
  CONSTRAINT chk_postes_internes_portee_chapitre CHECK (
    (portee = 'devis' AND chapitre_ligne_id IS NULL)
    OR (portee = 'chapitre' AND chapitre_ligne_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_postes_internes_devis
  ON postes_internes_devis (devis_id, ordre);
CREATE INDEX IF NOT EXISTS idx_postes_internes_chapitre
  ON postes_internes_devis (chapitre_ligne_id)
  WHERE chapitre_ligne_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_postes_internes_updated_at ON postes_internes_devis;
CREATE TRIGGER trg_postes_internes_updated_at
  BEFORE UPDATE ON postes_internes_devis
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- Poids par ligne pour un poste interne. Une entrée pour une ligne donnée
-- définit le poids de cette ligne dans la ventilation. Si aucun poids n'est
-- défini pour un poste, la ventilation est uniforme sur toutes les lignes
-- éligibles (poids implicite 1 partout).
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS repartitions_poste_interne (
  poste_interne_id UUID NOT NULL REFERENCES postes_internes_devis(id) ON DELETE CASCADE,
  ligne_devis_id UUID NOT NULL REFERENCES lignes_devis(id) ON DELETE CASCADE,
  poids NUMERIC(10, 4) NOT NULL,
  PRIMARY KEY (poste_interne_id, ligne_devis_id),
  CONSTRAINT chk_repartitions_poids_nonneg CHECK (poids >= 0)
);

CREATE INDEX IF NOT EXISTS idx_repartitions_ligne
  ON repartitions_poste_interne (ligne_devis_id);
