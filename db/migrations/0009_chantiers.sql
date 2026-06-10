-- 0009_chantiers.sql
-- M4.1 : module Chantiers — socle + liaison devis→chantier.
-- Schéma TypeScript miroir : db/schema/chantiers.ts
-- ADR : 011-module-chantiers
-- Appliquée via app_migrator. Idempotente.

-- =================================================================
-- 1. Enum statut_chantier
-- =================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_chantier') THEN
    CREATE TYPE statut_chantier AS ENUM ('prospect', 'en_cours', 'suspendu', 'termine', 'annule');
  END IF;
END $$;

-- =================================================================
-- 2. Table chantiers
-- =================================================================

CREATE TABLE IF NOT EXISTS chantiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL,
  libelle TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  responsable_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  statut statut_chantier NOT NULL DEFAULT 'prospect',
  date_debut_prevue DATE,
  date_fin_prevue DATE,
  date_debut_reelle DATE,
  date_fin_reelle DATE,
  montant_previsionnel_ht NUMERIC(14, 2),
  adresse_ligne1 TEXT,
  adresse_ligne2 TEXT,
  code_postal TEXT,
  ville TEXT,
  description TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_chantiers_dates_prevues CHECK (
    date_fin_prevue IS NULL OR date_debut_prevue IS NULL OR date_fin_prevue >= date_debut_prevue
  ),
  CONSTRAINT chk_chantiers_dates_reelles CHECK (
    date_fin_reelle IS NULL OR date_debut_reelle IS NULL OR date_fin_reelle >= date_debut_reelle
  ),
  CONSTRAINT chk_chantiers_code_postal CHECK (
    code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chantiers_numero_active
  ON chantiers (numero) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chantiers_client ON chantiers (client_id);
CREATE INDEX IF NOT EXISTS idx_chantiers_statut ON chantiers (statut);
CREATE INDEX IF NOT EXISTS idx_chantiers_responsable ON chantiers (responsable_id);

DROP TRIGGER IF EXISTS trg_chantiers_updated_at ON chantiers;
CREATE TRIGGER trg_chantiers_updated_at
  BEFORE UPDATE ON chantiers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 3. Activation FK devis.chantier_id (placeholder M3.1 → vraie FK)
-- =================================================================
-- Les devis M3.1 ont chantier_id IS NULL : ADD CONSTRAINT ne casse rien.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_devis_chantier'
  ) THEN
    ALTER TABLE devis
      ADD CONSTRAINT fk_devis_chantier
        FOREIGN KEY (chantier_id) REFERENCES chantiers(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_devis_chantier ON devis (chantier_id);

-- =================================================================
-- 4. Étendre generate_numero pour accepter le type 'chantier' (préfixe CH)
-- =================================================================
-- CREATE OR REPLACE pour ajouter le nouveau type sans toucher au reste.

CREATE OR REPLACE FUNCTION generate_numero(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_seq_name TEXT := format('seq_%s_%s', lower(p_type), v_year);
  v_next INTEGER;
  v_prefix TEXT;
  v_numero TEXT;
BEGIN
  v_prefix := CASE lower(p_type)
    WHEN 'devis'      THEN 'D'
    WHEN 'facture'    THEN 'F'
    WHEN 'commande'   THEN 'C'
    WHEN 'contrat_st' THEN 'ST'
    WHEN 'facture_st' THEN 'FST'
    WHEN 'chantier'   THEN 'CH'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Type de numéro inconnu: %', p_type
      USING HINT = 'Types acceptés : devis, facture, commande, contrat_st, facture_st, chantier';
  END IF;

  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS %I START 1 INCREMENT 1 NO CYCLE',
    v_seq_name
  );

  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_next;

  v_numero := format('%s-%s-%s', v_prefix, v_year, lpad(v_next::TEXT, 6, '0'));

  INSERT INTO numeros_attribues (type_doc, annee, sequence, numero_complet)
  VALUES (lower(p_type), v_year, v_next, v_numero);

  RETURN v_numero;
END;
$$;

GRANT EXECUTE ON FUNCTION generate_numero(TEXT) TO app_rw;

-- =================================================================
-- 5. Tests de fumée
-- =================================================================
-- SELECT generate_numero('chantier');  -- doit retourner CH-<annee>-000001
-- SELECT * FROM pg_constraint WHERE conname = 'fk_devis_chantier';
-- INSERT INTO chantiers (libelle, client_id) VALUES ('test', (SELECT id FROM clients LIMIT 1));
