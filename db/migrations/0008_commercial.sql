-- 0008_commercial.sql
-- M3.1 : module commercial — clients + devis multi-lignes + multi-TVA.
-- Schéma TypeScript miroir : db/schema/commercial.ts
-- ADR : 010-devis-multi-lignes (à créer)
-- Appliquée via app_migrator. Idempotente.

-- =================================================================
-- 1. Enums
-- =================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_client') THEN
    CREATE TYPE type_client AS ENUM ('particulier', 'professionnel');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_devis') THEN
    CREATE TYPE statut_devis AS ENUM ('brouillon', 'envoye', 'accepte', 'refuse', 'expire');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_ligne_devis') THEN
    CREATE TYPE type_ligne_devis AS ENUM ('section', 'article_catalogue', 'libre');
  END IF;
END $$;

-- =================================================================
-- 2. Table clients
-- =================================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  type type_client NOT NULL,
  raison_sociale TEXT,
  nom TEXT,
  prenom TEXT,
  siret TEXT,
  tva_intra TEXT,
  email TEXT,
  telephone TEXT,
  adresse_ligne1 TEXT NOT NULL,
  adresse_ligne2 TEXT,
  code_postal TEXT NOT NULL,
  ville TEXT NOT NULL,
  pays TEXT NOT NULL DEFAULT 'France',
  notes TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_clients_code_format CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_clients_type_cohesion CHECK (
    (type = 'particulier' AND nom IS NOT NULL)
    OR (type = 'professionnel' AND raison_sociale IS NOT NULL)
  ),
  CONSTRAINT chk_clients_siret CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$'),
  CONSTRAINT chk_clients_cp CHECK (code_postal ~ '^[0-9]{5}$'),
  CONSTRAINT chk_clients_email CHECK (email IS NULL OR email ~ '@')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_code_active
  ON clients (code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_siret_active
  ON clients (siret) WHERE deleted_at IS NULL AND siret IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_ville ON clients (ville);

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 3. Table devis
-- =================================================================

CREATE TABLE IF NOT EXISTS devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  chantier_id UUID,
  date_devis DATE NOT NULL DEFAULT CURRENT_DATE,
  date_validite DATE NOT NULL,
  statut statut_devis NOT NULL DEFAULT 'brouillon',
  objet TEXT,
  conditions_generales TEXT,
  notes TEXT,
  total_ht NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tva NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc NUMERIC(14, 2) NOT NULL DEFAULT 0,
  details_tva JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_devis_validite CHECK (date_validite >= date_devis)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_devis_numero_active
  ON devis (numero) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_devis_client ON devis (client_id);
CREATE INDEX IF NOT EXISTS idx_devis_statut ON devis (statut);
CREATE INDEX IF NOT EXISTS idx_devis_date ON devis (date_devis DESC);

DROP TRIGGER IF EXISTS trg_devis_updated_at ON devis;
CREATE TRIGGER trg_devis_updated_at
  BEFORE UPDATE ON devis
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 4. Table lignes_devis
-- =================================================================

CREATE TABLE IF NOT EXISTS lignes_devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devis_id UUID NOT NULL REFERENCES devis(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  type type_ligne_devis NOT NULL,
  designation TEXT NOT NULL,
  article_id UUID REFERENCES articles(id) ON DELETE RESTRICT,
  quantite NUMERIC(14, 4),
  unite TEXT,
  prix_unitaire_ht NUMERIC(14, 2),
  taux_tva NUMERIC(5, 2),
  remise_pourcent NUMERIC(5, 2) DEFAULT 0,
  montant_ht NUMERIC(14, 2),
  montant_tva NUMERIC(14, 2),
  montant_ttc NUMERIC(14, 2),
  notes TEXT,
  CONSTRAINT chk_lignes_devis_type_section CHECK (
    (type = 'section' AND quantite IS NULL AND prix_unitaire_ht IS NULL AND taux_tva IS NULL)
    OR (type <> 'section' AND quantite IS NOT NULL AND prix_unitaire_ht IS NOT NULL AND taux_tva IS NOT NULL)
  ),
  CONSTRAINT chk_lignes_devis_type_article CHECK (
    (type = 'article_catalogue' AND article_id IS NOT NULL)
    OR (type <> 'article_catalogue' AND article_id IS NULL)
  ),
  CONSTRAINT chk_lignes_devis_remise CHECK (remise_pourcent IS NULL OR (remise_pourcent >= 0 AND remise_pourcent <= 100)),
  CONSTRAINT chk_lignes_devis_taux_tva CHECK (taux_tva IS NULL OR (taux_tva >= 0 AND taux_tva <= 100))
);

CREATE INDEX IF NOT EXISTS idx_lignes_devis_devis ON lignes_devis (devis_id, ordre);
