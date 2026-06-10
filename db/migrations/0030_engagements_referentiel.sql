-- 0030_engagements_referentiel.sql
-- Types d'engagement (Marché de travaux / Bon de commande) + cloisonnement
-- par nature de tier (FEB_Contrôle Artisans.docx Table 1) + règles applicables
-- aux sociétés du groupe (Table 2).

BEGIN;

CREATE TYPE type_engagement AS ENUM (
  'marche_travaux',
  'bon_commande'
);

-- Matrice nature_tiers × type_engagement (porte Table 1 du docx).
-- Exemple : artisan (sous-traitant pur) → marché_travaux=true, bon_commande=false.
CREATE TABLE nature_tiers_types_engagement (
  nature_tiers nature_tiers NOT NULL,
  type_engagement type_engagement NOT NULL,
  autorise BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  PRIMARY KEY (nature_tiers, type_engagement)
);

CREATE TRIGGER trg_nature_tiers_engagement_updated_at
  BEFORE UPDATE ON nature_tiers_types_engagement
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Seed conforme à la Table 1 du docx (lignes 11-25) :
--   nature                  | marche_travaux | bon_commande
--   artisan                 |      OUI       |      NON
--   artisan_ae              |      OUI       |      NON
--   fournisseur             |      NON       |      OUI
--   fournisseur_artisan     |      OUI       |      OUI
INSERT INTO nature_tiers_types_engagement (nature_tiers, type_engagement, autorise) VALUES
  ('artisan',              'marche_travaux', true),
  ('artisan',              'bon_commande',   false),
  ('artisan_ae',           'marche_travaux', true),
  ('artisan_ae',           'bon_commande',   false),
  ('fournisseur',          'marche_travaux', false),
  ('fournisseur',          'bon_commande',   true),
  ('fournisseur_artisan',  'marche_travaux', true),
  ('fournisseur_artisan',  'bon_commande',   true);

-- Règles à appliquer par société (porte Table 2 du docx).
-- Première règle métier connue : suspension de chantier avec envoi LRAR.
-- Architecture extensible : le code de règle est un texte (pas un enum) pour
-- pouvoir ajouter une règle via paramétrage sans migration.
CREATE TABLE societes_regles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  societe_id UUID NOT NULL REFERENCES societes(id) ON DELETE CASCADE,
  code_regle TEXT NOT NULL,
  libelle TEXT NOT NULL,
  applique BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  CONSTRAINT chk_societes_regles_code_format
    CHECK (code_regle ~ '^[A-Z0-9._-]{2,64}$')
);

CREATE UNIQUE INDEX uq_societes_regles_societe_code
  ON societes_regles (societe_id, code_regle);

CREATE INDEX idx_societes_regles_societe ON societes_regles (societe_id);

CREATE TRIGGER trg_societes_regles_updated_at
  BEFORE UPDATE ON societes_regles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON
  nature_tiers_types_engagement, societes_regles
  TO app_rw;

COMMIT;
