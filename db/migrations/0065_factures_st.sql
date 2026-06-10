-- 0065_factures_st.sql
-- M8.3 — Factures de sous-traitant (FACTURE_ST) + lignes (multi-lignes).
-- Schéma TypeScript miroir : db/schema/sous-traitance.ts (facturesSt, lignesFactureSt).
-- Validation : lib/validation/facture-st.ts.
--
-- Une facture ST est rattachée à un contrat ST. Retenue de garantie OBLIGATOIRE
-- (figée depuis le contrat), montant_net = TTC − retenue. Paiement direct
-- (loi 75-1334 §III) tracé par un flag + un cumul payé. Numéro FST-<année>-000XXX
-- via generate_numero('facture_st', entreprise_id).
--
-- Lignes calquées sur lignes_facture (sections / articles / libres) → réutilise
-- lib/facturation/calculs.ts et lib/remise-globale.ts sans duplication.
--
-- ⚠️ Appliquer en superuser (erpbtp) : POLICY / TRIGGER.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_facture_st') THEN
    CREATE TYPE statut_facture_st AS ENUM (
      'brouillon',
      'emise',
      'payee',
      'en_retard',
      'annulee'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS factures_st (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  contrat_st_id UUID NOT NULL REFERENCES contrats_st(id) ON DELETE RESTRICT,
  numero TEXT NOT NULL,                       -- FST-2026-000019
  date_facture DATE NOT NULL DEFAULT now(),
  date_echeance DATE,
  delai_paiement_jours INTEGER,
  statut statut_facture_st NOT NULL DEFAULT 'brouillon',
  objet TEXT,
  notes TEXT,
  total_ht NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_tva NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_ttc NUMERIC(14,2) NOT NULL DEFAULT 0,
  details_tva JSONB,
  remise_globale_type TEXT,
  remise_globale_valeur NUMERIC(14,2),
  -- Retenue de garantie OBLIGATOIRE (figée depuis le contrat ST).
  retenue_garantie_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  montant_retenue NUMERIC(14,2) NOT NULL DEFAULT 0,
  montant_net NUMERIC(14,2) NOT NULL DEFAULT 0,   -- = total_ttc − montant_retenue
  -- Auto-liquidation TVA BTP (art. 283-2 nonies CGI) : le sous-traitant facture
  -- HT, le donneur d'ordre auto-liquide → défaut TRUE pour la sous-traitance.
  auto_liquidation BOOLEAN NOT NULL DEFAULT true,
  -- Paiement direct du sous-traitant (case à cocher) + suivi des règlements.
  paiement_direct BOOLEAN NOT NULL DEFAULT false,
  cumul_paye_ttc NUMERIC(14,2) NOT NULL DEFAULT 0,
  date_emission TIMESTAMPTZ,
  date_paiement DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_factures_st_retenue
    CHECK (retenue_garantie_pct >= 0 AND retenue_garantie_pct <= 10),
  CONSTRAINT chk_factures_st_cumul CHECK (cumul_paye_ttc >= 0),
  CONSTRAINT chk_factures_st_dates
    CHECK (date_echeance IS NULL OR date_echeance >= date_facture),
  CONSTRAINT chk_factures_st_remise_globale
    CHECK (remise_globale_type IS NULL OR (
      remise_globale_type IN ('pourcent','montant')
      AND remise_globale_valeur IS NOT NULL AND remise_globale_valeur > 0
      AND (remise_globale_type <> 'pourcent' OR remise_globale_valeur <= 100)
    ))
);

-- Idempotence : si la table préexiste (migration ré-appliquée), garantir la colonne.
ALTER TABLE factures_st ADD COLUMN IF NOT EXISTS auto_liquidation BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_factures_st_entreprise_numero
  ON factures_st (entreprise_id, numero) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_factures_st_entreprise ON factures_st (entreprise_id);
CREATE INDEX IF NOT EXISTS idx_factures_st_contrat ON factures_st (contrat_st_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_factures_st_statut ON factures_st (statut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_factures_st_date ON factures_st (date_facture DESC);

DROP TRIGGER IF EXISTS trg_factures_st_updated_at ON factures_st;
CREATE TRIGGER trg_factures_st_updated_at
  BEFORE UPDATE ON factures_st
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_factures_st ON factures_st;
CREATE TRIGGER trg_inherit_entreprise_id_factures_st
  BEFORE INSERT ON factures_st
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('contrats_st', 'contrat_st_id');

ALTER TABLE factures_st ENABLE ROW LEVEL SECURITY;
ALTER TABLE factures_st FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON factures_st;
CREATE POLICY p_tenant ON factures_st
  AS PERMISSIVE FOR ALL TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

-- ─────────────────────────────────────────────────────────────
-- Lignes de facture ST (calquées sur lignes_facture)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lignes_facture_st (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  facture_st_id UUID NOT NULL REFERENCES factures_st(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  type type_ligne_facture NOT NULL,           -- enum réutilisé (section|article_catalogue|libre)
  designation TEXT NOT NULL,
  article_id UUID REFERENCES articles(id) ON DELETE RESTRICT,
  quantite NUMERIC(14,4),
  unite TEXT,
  prix_unitaire_ht NUMERIC(14,2),
  taux_tva NUMERIC(5,2),
  remise_pourcent NUMERIC(5,2) DEFAULT 0,
  montant_ht NUMERIC(14,2),
  montant_tva NUMERIC(14,2),
  montant_ttc NUMERIC(14,2),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_lignes_facture_st_facture ON lignes_facture_st (facture_st_id, ordre);

DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_lignes_facture_st ON lignes_facture_st;
CREATE TRIGGER trg_inherit_entreprise_id_lignes_facture_st
  BEFORE INSERT ON lignes_facture_st
  FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id('factures_st', 'facture_st_id');

ALTER TABLE lignes_facture_st ENABLE ROW LEVEL SECURITY;
ALTER TABLE lignes_facture_st FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_tenant ON lignes_facture_st;
CREATE POLICY p_tenant ON lignes_facture_st
  AS PERMISSIVE FOR ALL TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);

COMMIT;
