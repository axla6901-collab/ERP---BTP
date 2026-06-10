-- 0005_catalogue_tables.sql
-- Tables M2 (bibliothèque de prix) : familles_ouvrage, familles_article, articles,
--   ouvrages, compositions_ouvrage, fournisseurs, tarifs_fournisseur.
-- Schéma TypeScript miroir : db/schema/catalogue.ts
--
-- M2.1 : socle complet ; les CRUD applicatifs ne sont implémentés que pour
-- familles_ouvrage, familles_article et articles. Ouvrages/compositions/tarifs
-- seront alimentés en M2.2/M2.3.
--
-- Cette migration COMPLÈTE celle générée par drizzle-kit (qu'on n'utilise plus
-- depuis M1.2, on préfère SQL natif pour les triggers + index partiels).

-- =================================================================
-- 1. familles_ouvrage
-- =================================================================

CREATE TABLE IF NOT EXISTS familles_ouvrage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  description TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_familles_ouvrage_code_format
    CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_familles_ouvrage_libelle_len
    CHECK (char_length(libelle) BETWEEN 2 AND 200)
);

-- Code unique parmi les lignes non supprimées (autorise réutilisation après soft delete)
CREATE UNIQUE INDEX IF NOT EXISTS uq_familles_ouvrage_code_active
  ON familles_ouvrage (code) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_familles_ouvrage_actif
  ON familles_ouvrage (actif) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_familles_ouvrage_updated_at ON familles_ouvrage;
CREATE TRIGGER trg_familles_ouvrage_updated_at
  BEFORE UPDATE ON familles_ouvrage
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 2. familles_article
-- =================================================================

CREATE TABLE IF NOT EXISTS familles_article (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  description TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_familles_article_code_format
    CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_familles_article_libelle_len
    CHECK (char_length(libelle) BETWEEN 2 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_familles_article_code_active
  ON familles_article (code) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_familles_article_actif
  ON familles_article (actif) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_familles_article_updated_at ON familles_article;
CREATE TRIGGER trg_familles_article_updated_at
  BEFORE UPDATE ON familles_article
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 3. articles
-- =================================================================

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  famille_article_id UUID NOT NULL REFERENCES familles_article(id) ON DELETE RESTRICT,
  unite TEXT NOT NULL,
  prix_unitaire_ht NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_articles_code_format CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_articles_libelle_len CHECK (char_length(libelle) BETWEEN 2 AND 200),
  CONSTRAINT chk_articles_unite_len CHECK (char_length(unite) BETWEEN 1 AND 20),
  CONSTRAINT chk_articles_prix_positif CHECK (prix_unitaire_ht >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_articles_code_active
  ON articles (code) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_articles_famille ON articles (famille_article_id);
CREATE INDEX IF NOT EXISTS idx_articles_actif ON articles (actif) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_articles_updated_at ON articles;
CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 4. ouvrages (schéma posé, CRUD en M2.2)
-- =================================================================

CREATE TABLE IF NOT EXISTS ouvrages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  libelle TEXT NOT NULL,
  famille_ouvrage_id UUID NOT NULL REFERENCES familles_ouvrage(id) ON DELETE RESTRICT,
  unite TEXT NOT NULL,
  prix_unitaire_ht NUMERIC(14, 2) NOT NULL DEFAULT 0,
  prix_calcule BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_ouvrages_code_format CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_ouvrages_libelle_len CHECK (char_length(libelle) BETWEEN 2 AND 200),
  CONSTRAINT chk_ouvrages_unite_len CHECK (char_length(unite) BETWEEN 1 AND 20),
  CONSTRAINT chk_ouvrages_prix_positif CHECK (prix_unitaire_ht >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ouvrages_code_active
  ON ouvrages (code) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ouvrages_famille ON ouvrages (famille_ouvrage_id);
CREATE INDEX IF NOT EXISTS idx_ouvrages_actif ON ouvrages (actif) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_ouvrages_updated_at ON ouvrages;
CREATE TRIGGER trg_ouvrages_updated_at
  BEFORE UPDATE ON ouvrages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 5. compositions_ouvrage (schéma posé, CRUD en M2.2)
-- =================================================================

CREATE TABLE IF NOT EXISTS compositions_ouvrage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ouvrage_id UUID NOT NULL REFERENCES ouvrages(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
  quantite NUMERIC(14, 4) NOT NULL,
  CONSTRAINT uq_compositions_ouvrage_article UNIQUE (ouvrage_id, article_id),
  CONSTRAINT chk_compositions_quantite_positive CHECK (quantite > 0)
);

CREATE INDEX IF NOT EXISTS idx_compositions_ouvrage ON compositions_ouvrage (ouvrage_id);

-- =================================================================
-- 6. fournisseurs (schéma posé, CRUD en M2.3)
-- =================================================================

CREATE TABLE IF NOT EXISTS fournisseurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  siret TEXT,
  email TEXT,
  telephone TEXT,
  actif BOOLEAN NOT NULL DEFAULT true,
  date_sortie DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_fournisseurs_code_format CHECK (code ~ '^[A-Z0-9._-]{2,32}$'),
  CONSTRAINT chk_fournisseurs_nom_len CHECK (char_length(nom) BETWEEN 2 AND 200),
  CONSTRAINT chk_fournisseurs_siret CHECK (siret IS NULL OR siret ~ '^[0-9]{14}$'),
  CONSTRAINT chk_fournisseurs_actif_date
    CHECK ((actif = true AND date_sortie IS NULL) OR (actif = false AND date_sortie IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fournisseurs_code_active
  ON fournisseurs (code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fournisseurs_siret_active
  ON fournisseurs (siret) WHERE deleted_at IS NULL AND siret IS NOT NULL;

DROP TRIGGER IF EXISTS trg_fournisseurs_updated_at ON fournisseurs;
CREATE TRIGGER trg_fournisseurs_updated_at
  BEFORE UPDATE ON fournisseurs
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 7. tarifs_fournisseur (schéma posé, CRUD en M2.3)
-- =================================================================

CREATE TABLE IF NOT EXISTS tarifs_fournisseur (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  fournisseur_id UUID NOT NULL REFERENCES fournisseurs(id) ON DELETE CASCADE,
  prix_unitaire_ht NUMERIC(14, 2) NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE,
  CONSTRAINT chk_tarifs_prix_positif CHECK (prix_unitaire_ht >= 0),
  CONSTRAINT chk_tarifs_dates_coherentes CHECK (date_fin IS NULL OR date_fin >= date_debut),
  CONSTRAINT uq_tarifs_fournisseur_article_debut
    UNIQUE (article_id, fournisseur_id, date_debut)
);

CREATE INDEX IF NOT EXISTS idx_tarifs_article_date
  ON tarifs_fournisseur (article_id, date_debut DESC);
CREATE INDEX IF NOT EXISTS idx_tarifs_fournisseur
  ON tarifs_fournisseur (fournisseur_id);
