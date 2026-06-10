-- 0006_catalogue_refonte.sql
-- Refonte M2.1-bis du catalogue selon le prompt « Articles Composés » adapté BTP.
-- Schéma TypeScript miroir : db/schema/catalogue.ts (v2)
-- ADR : à venir (008-catalogue-articles-composes).
--
-- Cette migration est partiellement destructive :
--   - DROP des tables familles_ouvrage, familles_article, ouvrages, compositions_ouvrage
--     (après backup en familles_ouvrage_legacy_2026_05_21, etc.)
--   - Création des nouvelles tables unites, unite_conversions, familles, articles_v2
--   - Migration des données existantes (familles + articles) vers les nouvelles tables
--   - Renommage final articles → articles_legacy_2026_05_21, articles_v2 → articles
--
-- Appliquée via app_migrator. Idempotente sur les CREATE (IF NOT EXISTS) ;
-- les blocs DML conditionnés sur l'existence de la table source.

-- =================================================================
-- 1. Enums
-- =================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unite_type') THEN
    CREATE TYPE unite_type AS ENUM ('masse', 'longueur', 'surface', 'volume', 'unitaire', 'temps', 'autre');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'article_type') THEN
    CREATE TYPE article_type AS ENUM ('simple', 'compose', 'prestation', 'operation');
  END IF;
END $$;

-- =================================================================
-- 2. Référentiel unités
-- =================================================================

CREATE TABLE IF NOT EXISTS unites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  symbole TEXT NOT NULL,
  type unite_type NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_unites_code_format CHECK (code ~ '^[A-Z0-9._-]{1,16}$'),
  CONSTRAINT chk_unites_libelle_len CHECK (char_length(libelle) BETWEEN 2 AND 100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_unites_code_active
  ON unites (code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_unites_type ON unites (type);

DROP TRIGGER IF EXISTS trg_unites_updated_at ON unites;
CREATE TRIGGER trg_unites_updated_at
  BEFORE UPDATE ON unites
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Seed unités courantes BTP (idempotent)
INSERT INTO unites (code, libelle, symbole, type) VALUES
  ('U',       'Unité',           'u',     'unitaire'),
  ('FORFAIT', 'Forfait',         'forf.', 'unitaire'),
  ('KG',      'Kilogramme',      'kg',    'masse'),
  ('T',       'Tonne',           't',     'masse'),
  ('M',       'Mètre',           'm',     'longueur'),
  ('ML',      'Mètre linéaire',  'ml',    'longueur'),
  ('M2',      'Mètre carré',     'm²',    'surface'),
  ('M3',      'Mètre cube',      'm³',    'volume'),
  ('L',       'Litre',           'L',     'volume'),
  ('H',       'Heure',           'h',     'temps'),
  ('J',       'Jour',            'j',     'temps'),
  ('SAC',     'Sac',             'sac',   'unitaire'),
  ('PAL',     'Palette',         'pal.',  'unitaire')
ON CONFLICT DO NOTHING;

-- =================================================================
-- 3. Conversions entre unités du même type
-- =================================================================

CREATE TABLE IF NOT EXISTS unite_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unite_source_id UUID NOT NULL REFERENCES unites(id) ON DELETE CASCADE,
  unite_cible_id UUID NOT NULL REFERENCES unites(id) ON DELETE CASCADE,
  facteur NUMERIC(18, 8) NOT NULL,
  CONSTRAINT uq_unite_conversions_pair UNIQUE (unite_source_id, unite_cible_id),
  CONSTRAINT chk_unite_conv_facteur CHECK (facteur > 0),
  CONSTRAINT chk_unite_conv_distinct CHECK (unite_source_id <> unite_cible_id)
);

-- Trigger : vérifier que source et cible sont du même type
CREATE OR REPLACE FUNCTION check_unite_conversion_type()
RETURNS TRIGGER AS $$
DECLARE
  v_src_type unite_type;
  v_dst_type unite_type;
BEGIN
  SELECT type INTO v_src_type FROM unites WHERE id = NEW.unite_source_id;
  SELECT type INTO v_dst_type FROM unites WHERE id = NEW.unite_cible_id;
  IF v_src_type <> v_dst_type THEN
    RAISE EXCEPTION 'Conversion impossible entre types différents (% / %). Utiliser caractéristiques physiques de l''article.',
      v_src_type, v_dst_type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_unite_conversion_type ON unite_conversions;
CREATE TRIGGER trg_unite_conversion_type
  BEFORE INSERT OR UPDATE ON unite_conversions
  FOR EACH ROW EXECUTE FUNCTION check_unite_conversion_type();

-- Seeds conversions standard (idempotent — utilise une fonction de lookup par code)
DO $$
DECLARE
  v_kg UUID; v_t UUID; v_m UUID; v_ml UUID; v_h UUID; v_j UUID; v_l UUID; v_m3 UUID;
BEGIN
  SELECT id INTO v_kg FROM unites WHERE code='KG';
  SELECT id INTO v_t  FROM unites WHERE code='T';
  SELECT id INTO v_m  FROM unites WHERE code='M';
  SELECT id INTO v_ml FROM unites WHERE code='ML';
  SELECT id INTO v_h  FROM unites WHERE code='H';
  SELECT id INTO v_j  FROM unites WHERE code='J';
  SELECT id INTO v_l  FROM unites WHERE code='L';
  SELECT id INTO v_m3 FROM unites WHERE code='M3';

  -- 1 T = 1000 KG
  INSERT INTO unite_conversions (unite_source_id, unite_cible_id, facteur)
    VALUES (v_t, v_kg, 1000), (v_kg, v_t, 0.001)
    ON CONFLICT DO NOTHING;

  -- M ↔ ML (équivalents)
  INSERT INTO unite_conversions (unite_source_id, unite_cible_id, facteur)
    VALUES (v_m, v_ml, 1), (v_ml, v_m, 1)
    ON CONFLICT DO NOTHING;

  -- 1 J = 8 H
  INSERT INTO unite_conversions (unite_source_id, unite_cible_id, facteur)
    VALUES (v_j, v_h, 8), (v_h, v_j, 0.125)
    ON CONFLICT DO NOTHING;

  -- 1 M³ = 1000 L
  INSERT INTO unite_conversions (unite_source_id, unite_cible_id, facteur)
    VALUES (v_m3, v_l, 1000), (v_l, v_m3, 0.001)
    ON CONFLICT DO NOTHING;
END $$;

-- =================================================================
-- 4. Familles hiérarchiques
-- =================================================================

CREATE TABLE IF NOT EXISTS familles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  parent_id UUID REFERENCES familles(id) ON DELETE RESTRICT,
  description TEXT,
  ordre INTEGER NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_familles_code_format CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_familles_libelle_len CHECK (char_length(libelle) BETWEEN 2 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_familles_code_active
  ON familles (code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_familles_parent ON familles (parent_id);

DROP TRIGGER IF EXISTS trg_familles_updated_at ON familles;
CREATE TRIGGER trg_familles_updated_at
  BEFORE UPDATE ON familles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Trigger anti-cycle + profondeur max 5
CREATE OR REPLACE FUNCTION check_familles_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  v_ancestor UUID := NEW.parent_id;
  v_depth INTEGER := 0;
BEGIN
  IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Famille ne peut pas être son propre parent.';
  END IF;
  WHILE v_ancestor IS NOT NULL LOOP
    v_depth := v_depth + 1;
    IF v_depth > 5 THEN
      RAISE EXCEPTION 'Profondeur de hiérarchie familles dépasse 5 niveaux.';
    END IF;
    SELECT parent_id INTO v_ancestor FROM familles WHERE id = v_ancestor;
    IF v_ancestor = NEW.id THEN
      RAISE EXCEPTION 'Cycle détecté dans l''arborescence des familles.';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_familles_hierarchy ON familles;
CREATE TRIGGER trg_familles_hierarchy
  BEFORE INSERT OR UPDATE ON familles
  FOR EACH ROW EXECUTE FUNCTION check_familles_hierarchy();

-- =================================================================
-- 5. Articles (table cible articles_v2 le temps de la migration)
-- =================================================================

CREATE TABLE IF NOT EXISTS articles_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  famille_id UUID NOT NULL REFERENCES familles(id) ON DELETE RESTRICT,
  type article_type NOT NULL DEFAULT 'simple',
  unite_achat_id UUID REFERENCES unites(id) ON DELETE RESTRICT,
  unite_stock_id UUID REFERENCES unites(id) ON DELETE RESTRICT,
  unite_vente_id UUID REFERENCES unites(id) ON DELETE RESTRICT,
  densite NUMERIC(10, 4),
  epaisseur NUMERIC(10, 4),
  longueur_std NUMERIC(10, 4),
  largeur_std NUMERIC(10, 4),
  description TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_articles_v2_code_format CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_articles_v2_libelle_len CHECK (char_length(libelle) BETWEEN 2 AND 200),
  CONSTRAINT chk_articles_v2_densite CHECK (densite IS NULL OR densite > 0),
  CONSTRAINT chk_articles_v2_epaisseur CHECK (epaisseur IS NULL OR epaisseur > 0),
  CONSTRAINT chk_articles_v2_long CHECK (longueur_std IS NULL OR longueur_std > 0),
  CONSTRAINT chk_articles_v2_larg CHECK (largeur_std IS NULL OR largeur_std > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_articles_v2_code_active
  ON articles_v2 (code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_articles_v2_famille ON articles_v2 (famille_id);
CREATE INDEX IF NOT EXISTS idx_articles_v2_type ON articles_v2 (type);

DROP TRIGGER IF EXISTS trg_articles_v2_updated_at ON articles_v2;
CREATE TRIGGER trg_articles_v2_updated_at
  BEFORE UPDATE ON articles_v2
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 6. Migration des données existantes (idempotent : skip si déjà migré)
-- =================================================================

DO $$
DECLARE
  v_count_existing INTEGER;
BEGIN
  -- Skip si la migration a déjà été faite (familles a des lignes)
  SELECT COUNT(*) INTO v_count_existing FROM familles;
  IF v_count_existing > 0 THEN
    RAISE NOTICE 'familles a déjà des lignes, skip migration data.';
    RETURN;
  END IF;

  -- Migrer familles_ouvrage → familles (préfixe OUV-)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'familles_ouvrage') THEN
    INSERT INTO familles (id, code, libelle, description, actif, created_at, updated_at, deleted_at)
    SELECT id, 'OUV-' || code, libelle, description, actif, created_at, updated_at, deleted_at
    FROM familles_ouvrage;
    RAISE NOTICE 'Migré familles_ouvrage vers familles (préfixe OUV-).';
  END IF;

  -- Migrer familles_article → familles (préfixe ART-)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'familles_article') THEN
    INSERT INTO familles (id, code, libelle, description, actif, created_at, updated_at, deleted_at)
    SELECT id, 'ART-' || code, libelle, description, actif, created_at, updated_at, deleted_at
    FROM familles_article;
    RAISE NOTICE 'Migré familles_article vers familles (préfixe ART-).';
  END IF;

  -- Migrer articles → articles_v2
  -- L'ancien champ `unite` texte est mappé vers unites par code/libellé.
  -- Si pas de correspondance, fallback sur 'U' (Unité).
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'articles') THEN
    INSERT INTO articles_v2 (
      id, code, libelle, famille_id, type, unite_achat_id, unite_stock_id, unite_vente_id,
      description, actif, created_at, updated_at, created_by, updated_by, deleted_at
    )
    SELECT
      a.id, a.code, a.libelle, a.famille_article_id, 'simple'::article_type,
      COALESCE(u.id, (SELECT id FROM unites WHERE code='U')),
      COALESCE(u.id, (SELECT id FROM unites WHERE code='U')),
      COALESCE(u.id, (SELECT id FROM unites WHERE code='U')),
      a.description, a.actif, a.created_at, a.updated_at, a.created_by, a.updated_by, a.deleted_at
    FROM articles a
    LEFT JOIN unites u ON (
      upper(a.unite) = u.code
      OR lower(a.unite) = lower(u.libelle)
      OR lower(a.unite) = lower(u.symbole)
    );
    RAISE NOTICE 'Migré articles vers articles_v2 (% lignes).', (SELECT COUNT(*) FROM articles_v2);
  END IF;
END $$;

-- =================================================================
-- 7. Renommage et drop des anciennes tables
-- =================================================================

-- Renommer les anciennes tables en *_legacy_2026_05_21 si elles existent encore
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compositions_ouvrage') THEN
    EXECUTE 'ALTER TABLE compositions_ouvrage RENAME TO compositions_ouvrage_legacy_2026_05_21';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ouvrages') THEN
    EXECUTE 'ALTER TABLE ouvrages RENAME TO ouvrages_legacy_2026_05_21';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'articles')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'articles_v2') THEN
    EXECUTE 'ALTER TABLE articles RENAME TO articles_legacy_2026_05_21';
    EXECUTE 'ALTER TABLE articles_v2 RENAME TO articles';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'familles_article') THEN
    EXECUTE 'ALTER TABLE familles_article RENAME TO familles_article_legacy_2026_05_21';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'familles_ouvrage') THEN
    EXECUTE 'ALTER TABLE familles_ouvrage RENAME TO familles_ouvrage_legacy_2026_05_21';
  END IF;
END $$;

-- Rename les contraintes/index pour qu'ils suivent les nouveaux noms de table
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_articles_v2_code_format')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_articles_code_format') THEN
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_code_format TO chk_articles_code_format;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_libelle_len TO chk_articles_libelle_len;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_densite TO chk_articles_densite;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_epaisseur TO chk_articles_epaisseur;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_long TO chk_articles_long;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_larg TO chk_articles_larg;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_articles_v2_code_active') THEN
    ALTER INDEX uq_articles_v2_code_active RENAME TO uq_articles_code_active;
    ALTER INDEX idx_articles_v2_famille RENAME TO idx_articles_famille;
    ALTER INDEX idx_articles_v2_type RENAME TO idx_articles_type;
  END IF;
END $$;
