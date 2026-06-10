-- 0019_facturation.sql
-- M6 — Module Facturation : factures + lignes + situations de travaux.
--
-- Couvre les deux modes BTP :
--   1. Facture directe (forfait, achat-vente, prestation hors chantier) — lignes
--      libres comme un devis.
--   2. Facture sur situation d'avancement (modèle CUMULÉ — convention CCAG-T) :
--      situations séquentielles par chantier, % d'avancement cumulé saisi
--      manuellement, delta calculé automatiquement, génération facture en 1 clic.
--
-- Schéma TypeScript miroir : db/schema/facturation.ts
-- generate_numero('facture') déjà disponible (cf. 0004_generate_numero.sql).
-- Idempotent.

-- =================================================================
-- 1. Enums
-- =================================================================

DO $$ BEGIN
  CREATE TYPE statut_facture AS ENUM (
    'brouillon',
    'emise',
    'payee',
    'en_retard',
    'annulee'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE statut_situation AS ENUM (
    'brouillon',
    'validee',
    'facturee',
    'annulee'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- type_ligne_facture mirror exact de type_ligne_devis (section/article_catalogue/libre)
DO $$ BEGIN
  CREATE TYPE type_ligne_facture AS ENUM (
    'section',
    'article_catalogue',
    'libre'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =================================================================
-- 2. Table factures
-- =================================================================

CREATE TABLE IF NOT EXISTS factures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE SET NULL,
  devis_id UUID REFERENCES devis(id) ON DELETE SET NULL,
  date_facture DATE NOT NULL DEFAULT CURRENT_DATE,
  date_echeance DATE,
  delai_paiement_jours INTEGER,
  statut statut_facture NOT NULL DEFAULT 'brouillon',
  objet TEXT,
  conditions_paiement TEXT,
  mentions_legales TEXT,
  notes TEXT,
  -- Cache totaux (mis à jour à chaque modification de lignes via Server Action)
  total_ht NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_tva NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_ttc NUMERIC(14, 2) NOT NULL DEFAULT 0,
  details_tva JSONB,
  -- Auto-liquidation TVA BTP (art. 283-2 nonies CGI) : si TRUE, total_tva=0 et
  -- mention « Auto-liquidation » obligatoire. À cocher uniquement pour sous-traitance
  -- de travaux entre pros assujettis.
  auto_liquidation BOOLEAN NOT NULL DEFAULT FALSE,
  -- Retenue de garantie (marchés privés et publics)
  retenue_garantie_pct NUMERIC(5, 2),
  montant_retenue NUMERIC(14, 2),
  -- Cycle de vie
  date_emission TIMESTAMPTZ,
  date_paiement DATE,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_factures_retenue_pct
    CHECK (retenue_garantie_pct IS NULL OR (retenue_garantie_pct >= 0 AND retenue_garantie_pct <= 10)),
  CONSTRAINT chk_factures_dates
    CHECK (date_echeance IS NULL OR date_echeance >= date_facture),
  CONSTRAINT chk_factures_paiement_si_payee
    CHECK ((statut = 'payee' AND date_paiement IS NOT NULL) OR statut <> 'payee')
);

CREATE INDEX IF NOT EXISTS idx_factures_client ON factures (client_id);
CREATE INDEX IF NOT EXISTS idx_factures_chantier ON factures (chantier_id);
CREATE INDEX IF NOT EXISTS idx_factures_devis ON factures (devis_id);
CREATE INDEX IF NOT EXISTS idx_factures_statut ON factures (statut);
CREATE INDEX IF NOT EXISTS idx_factures_date ON factures (date_facture DESC);

DROP TRIGGER IF EXISTS trg_factures_updated_at ON factures;
CREATE TRIGGER trg_factures_updated_at
  BEFORE UPDATE ON factures
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- 3. Table lignes_facture
-- =================================================================

CREATE TABLE IF NOT EXISTS lignes_facture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facture_id UUID NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  type type_ligne_facture NOT NULL,
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
  CONSTRAINT chk_lignes_facture_type_section
    CHECK (
      (type = 'section' AND quantite IS NULL AND prix_unitaire_ht IS NULL AND taux_tva IS NULL)
      OR (type <> 'section' AND quantite IS NOT NULL AND prix_unitaire_ht IS NOT NULL AND taux_tva IS NOT NULL)
    ),
  CONSTRAINT chk_lignes_facture_type_article
    CHECK (
      (type = 'article_catalogue' AND article_id IS NOT NULL)
      OR (type <> 'article_catalogue' AND article_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_lignes_facture_facture
  ON lignes_facture (facture_id, ordre);

-- =================================================================
-- 4. Table situations_travaux
-- =================================================================
-- Modèle CUMULÉ (convention CCAG-Travaux) :
--   - Chaque situation reprend le pourcentage TOTAL atteint depuis le début.
--   - Le delta à facturer = cumulé - précédent cumulé (calculé en application).
--   - Une situation peut générer une facture (1-1) ; tant que non facturée,
--     la situation reste en brouillon ou validée.
--   - Numérotation séquentielle par chantier (1, 2, 3...).

CREATE TABLE IF NOT EXISTS situations_travaux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chantier_id UUID NOT NULL REFERENCES chantiers(id) ON DELETE RESTRICT,
  numero INTEGER NOT NULL,
  date_situation DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Pourcentage TOTAL atteint depuis début du chantier (ex. 60.00 = 60 %)
  pct_avancement_cumule NUMERIC(5, 2) NOT NULL,
  -- Montant total marché HT (figé au moment de la situation : pré-rempli depuis
  -- chantier.montant_previsionnel_ht mais saisissable pour absorber les avenants)
  montant_marche_ht NUMERIC(14, 2) NOT NULL,
  -- Montants calculés (figés au moment de la situation)
  montant_cumule_ht NUMERIC(14, 2) NOT NULL,           -- = marché × pct/100
  montant_situation_precedente_ht NUMERIC(14, 2) NOT NULL DEFAULT 0,
  montant_a_facturer_ht NUMERIC(14, 2) NOT NULL,        -- = cumule - precedent
  taux_tva NUMERIC(5, 2) NOT NULL DEFAULT 20.00,
  statut statut_situation NOT NULL DEFAULT 'brouillon',
  facture_id UUID REFERENCES factures(id) ON DELETE SET NULL,
  notes TEXT,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_situations_chantier_numero UNIQUE (chantier_id, numero),
  CONSTRAINT chk_situations_pct_range
    CHECK (pct_avancement_cumule > 0 AND pct_avancement_cumule <= 100),
  CONSTRAINT chk_situations_marche_pos CHECK (montant_marche_ht > 0),
  CONSTRAINT chk_situations_montants_coherents
    CHECK (montant_a_facturer_ht = montant_cumule_ht - montant_situation_precedente_ht),
  CONSTRAINT chk_situations_tva_range CHECK (taux_tva >= 0 AND taux_tva <= 100)
);

CREATE INDEX IF NOT EXISTS idx_situations_chantier
  ON situations_travaux (chantier_id, numero DESC);
CREATE INDEX IF NOT EXISTS idx_situations_statut ON situations_travaux (statut);

DROP TRIGGER IF EXISTS trg_situations_updated_at ON situations_travaux;
CREATE TRIGGER trg_situations_updated_at
  BEFORE UPDATE ON situations_travaux
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
