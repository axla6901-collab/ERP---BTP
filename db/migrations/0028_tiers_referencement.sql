-- 0028_tiers_referencement.sql
-- Mise en place du registre unifié des tiers pour le module Référencement &
-- Agrément des sous-traitants (FEB_Contrôle Artisans.docx §I + schéma 04/03/2025).
--
-- Approche hybride : la table `tiers` est un registre NOUVEAU et DISTINCT
-- des tables historiques `sous_traitants` et `fournisseurs` (catalogue).
--   - `sous_traitants.tier_id` et `fournisseurs.tier_id` (nullable) lient
--     l'existant au registre unifié.
--   - Les sous-traitants présents sont backfillés en lignes de `tiers`
--     avec nature_tiers='artisan'. Les fournisseurs catalogue ne sont PAS
--     backfillés (étape future si besoin) — on évite les doublons de code.
--   - Toutes les nouvelles tables du module (corps d'état, documents,
--     agrément, relances) FK vers `tiers`.
--
-- Inclut également la table `societes` (groupe).
--
-- Schémas TypeScript miroirs :
--   - db/schema/societes.ts
--   - db/schema/tiers-registre.ts

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Enums nature_tiers + statut_agrement
-- ─────────────────────────────────────────────────────────────

CREATE TYPE nature_tiers AS ENUM (
  'artisan',
  'artisan_ae',          -- artisan auto-entrepreneur
  'fournisseur',
  'fournisseur_artisan'  -- tiers mixte
);

CREATE TYPE statut_agrement AS ENUM (
  'a_creer',                -- créé en ERP, pas encore en circuit doc
  'en_attente_documents',   -- relances en cours
  'agree',                  -- agrément validé
  'refuse_auto',            -- refus automatique après R3
  'refuse_manuel',          -- refus manuel par l'AT
  'suspendu'                -- agrément suspendu (renouvellement échoué)
);

-- ─────────────────────────────────────────────────────────────
-- 2. Sociétés du groupe (porte Table 2 du docx)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE societes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  raison_sociale TEXT NOT NULL,
  siret TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_societes_code_format
    CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_societes_raison_len
    CHECK (char_length(raison_sociale) BETWEEN 2 AND 200),
  CONSTRAINT chk_societes_siret
    CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$')
);

CREATE UNIQUE INDEX uq_societes_code_active
  ON societes (code) WHERE deleted_at IS NULL;

CREATE INDEX idx_societes_actif
  ON societes (actif) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_societes_updated_at
  BEFORE UPDATE ON societes
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. Registre des tiers (registre unifié)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  nature_tiers nature_tiers NOT NULL,
  -- Identification minimale issue du PDF d'agrément (04/03/2025)
  nom_gerant TEXT,
  tel_portable_gerant TEXT,
  -- Coordonnées
  siret TEXT,
  n_tva_intra TEXT,
  email TEXT,
  telephone TEXT,
  adresse_ligne1 TEXT,
  adresse_ligne2 TEXT,
  code_postal TEXT,
  ville TEXT,
  pays TEXT NOT NULL DEFAULT 'France',
  -- Agrément
  statut_agrement statut_agrement NOT NULL DEFAULT 'a_creer',
  date_agrement DATE,
  date_refus DATE,
  motif_refus TEXT,
  -- Acteurs internes (CDT = Conducteur de Travaux). Manager calculé via une
  -- table d'organigramme plus tard ; pour M0 on stocke explicitement.
  cdt_responsable_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  manager_cdt_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  -- Cycle de vie
  actif BOOLEAN NOT NULL DEFAULT true,
  date_sortie DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_tiers_code_format
    CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_tiers_nom_len
    CHECK (char_length(nom) BETWEEN 2 AND 200),
  CONSTRAINT chk_tiers_siret
    CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$'),
  CONSTRAINT chk_tiers_tva_intra
    CHECK (n_tva_intra IS NULL OR n_tva_intra ~ '^[A-Z]{2}[A-Z0-9]{2,13}$'),
  CONSTRAINT chk_tiers_cp
    CHECK (code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'),
  CONSTRAINT chk_tiers_actif_date
    CHECK ((actif = true AND date_sortie IS NULL) OR (actif = false AND date_sortie IS NOT NULL)),
  -- Refus = date_refus renseignée
  CONSTRAINT chk_tiers_refus_coherence
    CHECK (
      (statut_agrement IN ('refuse_auto','refuse_manuel') AND date_refus IS NOT NULL)
      OR
      (statut_agrement NOT IN ('refuse_auto','refuse_manuel') AND date_refus IS NULL)
    ),
  -- Agréé = date_agrement renseignée
  CONSTRAINT chk_tiers_agrement_coherence
    CHECK (
      (statut_agrement = 'agree' AND date_agrement IS NOT NULL)
      OR
      (statut_agrement <> 'agree')
    )
);

CREATE UNIQUE INDEX uq_tiers_code_active
  ON tiers (code) WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_tiers_siret_active
  ON tiers (siret) WHERE deleted_at IS NULL AND siret IS NOT NULL;

CREATE INDEX idx_tiers_actif ON tiers (actif) WHERE deleted_at IS NULL;
CREATE INDEX idx_tiers_nature ON tiers (nature_tiers) WHERE deleted_at IS NULL;
CREATE INDEX idx_tiers_statut_agrement ON tiers (statut_agrement) WHERE deleted_at IS NULL;
CREATE INDEX idx_tiers_cdt ON tiers (cdt_responsable_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tiers_ville ON tiers (ville) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_tiers_updated_at
  BEFORE UPDATE ON tiers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. Backfill : pont entre l'existant et le registre
-- ─────────────────────────────────────────────────────────────

-- 4a. FK optionnelle sur sous_traitants et fournisseurs.
ALTER TABLE sous_traitants
  ADD COLUMN tier_id UUID REFERENCES tiers(id) ON DELETE SET NULL;

ALTER TABLE fournisseurs
  ADD COLUMN tier_id UUID REFERENCES tiers(id) ON DELETE SET NULL;

-- 4b. Crée une ligne tiers (nature='artisan') pour chaque sous_traitant non
-- supprimé et lie via tier_id. Les colonnes spécifiques (nom_gerant,
-- tel_portable_gerant) restent NULL et seront complétées au prochain édit.
INSERT INTO tiers (
  code, nom, nature_tiers,
  siret, n_tva_intra, email, telephone,
  adresse_ligne1, adresse_ligne2, code_postal, ville, pays,
  statut_agrement,
  actif, date_sortie,
  created_at, updated_at, created_by, updated_by
)
SELECT
  st.code, st.nom, 'artisan'::nature_tiers,
  st.siret, st.n_tva_intra, st.email, st.telephone,
  st.adresse_ligne1, st.adresse_ligne2, st.code_postal, st.ville, st.pays,
  'a_creer'::statut_agrement,
  st.actif, st.date_sortie,
  st.created_at, st.updated_at, st.created_by, st.updated_by
FROM sous_traitants st
WHERE st.deleted_at IS NULL;

UPDATE sous_traitants st
SET tier_id = t.id
FROM tiers t
WHERE t.code = st.code
  AND st.tier_id IS NULL
  AND st.deleted_at IS NULL;

CREATE INDEX idx_sous_traitants_tier ON sous_traitants (tier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_fournisseurs_tier ON fournisseurs (tier_id) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON societes, tiers TO app_rw;

COMMIT;
