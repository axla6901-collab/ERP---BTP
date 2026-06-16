-- 0075_flotte_module.sql
-- Module Flotte automobile (option commerciale `entreprises.flotte_automobile_active`,
-- posée par 0076). Crée les enums + 7 tables :
--   flotte_vehicules (racine) + filles flotte_echeances, flotte_affectations,
--   flotte_entretiens, flotte_sinistres, flotte_pleins, flotte_documents.
-- Les filles héritent entreprise_id du véhicule parent via trg_inherit_entreprise_id (0044).
-- RLS p_tenant alignée sur les autres tables scopées (cf. 0043/0053).
-- numero_carte_carburant : BYTEA (chiffrement applicatif AES-256-GCM, cf. lib/crypto).
-- Migration idempotente.

BEGIN;

-- ── 1. Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_type_vehicule') THEN
    CREATE TYPE flotte_type_vehicule AS ENUM ('vl','vu','pl','engin','remorque','deux_roues');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_carburant') THEN
    CREATE TYPE flotte_carburant AS ENUM
      ('essence','diesel','gnv','electrique','hybride','hybride_rechargeable','e85','hydrogene');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_statut_vehicule') THEN
    CREATE TYPE flotte_statut_vehicule AS ENUM
      ('actif','immobilise','en_reparation','vendu','reforme','vole_detruit');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_mode_detention') THEN
    CREATE TYPE flotte_mode_detention AS ENUM
      ('propriete','lld','loa','credit_bail','location_courte');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_type_echeance') THEN
    CREATE TYPE flotte_type_echeance AS ENUM
      ('controle_technique','controle_technique_pollution','assurance','carte_grise',
       'vignette_critair','taxe_essieu','extincteur','chronotachygraphe',
       'revision_constructeur','franchise_km');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_type_entretien') THEN
    CREATE TYPE flotte_type_entretien AS ENUM
      ('revision','vidange','pneumatiques','freinage','reparation','carrosserie',
       'controle_technique','geometrie','climatisation','autre');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_statut_affectation') THEN
    CREATE TYPE flotte_statut_affectation AS ENUM ('prevue','en_cours','terminee','annulee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_responsabilite_sinistre') THEN
    CREATE TYPE flotte_responsabilite_sinistre AS ENUM
      ('tort_total','tort_partiel','non_responsable','indeterminee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flotte_type_document') THEN
    CREATE TYPE flotte_type_document AS ENUM
      ('carte_grise','attestation_assurance','pv_controle_technique','facture_entretien',
       'constat_sinistre','contrat_location','certificat_cession','photo','autre');
  END IF;
END $$;

-- ── 2. Table racine : véhicules ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flotte_vehicules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  immatriculation TEXT NOT NULL,
  code_interne TEXT,
  type_vehicule flotte_type_vehicule NOT NULL DEFAULT 'vl',
  marque TEXT NOT NULL,
  modele TEXT NOT NULL,
  version TEXT,
  vin TEXT,
  carburant flotte_carburant NOT NULL DEFAULT 'diesel',
  date_premiere_immat DATE,
  puissance_fiscale INTEGER,
  critair INTEGER,
  places INTEGER,
  ptac_kg INTEGER,
  couleur TEXT,
  mode_detention flotte_mode_detention NOT NULL DEFAULT 'propriete',
  date_acquisition DATE,
  prix_acquisition_ht NUMERIC(14,2),
  valeur_residuelle_ht NUMERIC(14,2),
  loyer_mensuel_ht NUMERIC(14,2),
  organisme_financement TEXT,
  kilometrage_actuel INTEGER NOT NULL DEFAULT 0,
  date_releve_km DATE,
  conducteur_principal_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  statut flotte_statut_vehicule NOT NULL DEFAULT 'actif',
  date_sortie_parc DATE,
  prix_revente_ht NUMERIC(14,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_flotte_vehicules_km CHECK (kilometrage_actuel >= 0),
  CONSTRAINT chk_flotte_vehicules_critair CHECK (critair IS NULL OR (critair >= 0 AND critair <= 5)),
  CONSTRAINT chk_flotte_vehicules_prix CHECK (
    (prix_acquisition_ht IS NULL OR prix_acquisition_ht >= 0)
    AND (valeur_residuelle_ht IS NULL OR valeur_residuelle_ht >= 0)
    AND (loyer_mensuel_ht IS NULL OR loyer_mensuel_ht >= 0)
    AND (prix_revente_ht IS NULL OR prix_revente_ht >= 0)
  ),
  CONSTRAINT chk_flotte_vehicules_sortie CHECK (
    statut NOT IN ('vendu','reforme','vole_detruit') OR date_sortie_parc IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_flotte_vehicules_immat_actif
  ON flotte_vehicules (entreprise_id, immatriculation) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_flotte_vehicules_code_actif
  ON flotte_vehicules (entreprise_id, code_interne)
  WHERE code_interne IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_vehicules_entreprise ON flotte_vehicules (entreprise_id);
CREATE INDEX IF NOT EXISTS idx_flotte_vehicules_statut
  ON flotte_vehicules (statut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_vehicules_conducteur
  ON flotte_vehicules (conducteur_principal_id);

-- ── 3. Échéances réglementaires ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flotte_echeances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  vehicule_id UUID NOT NULL REFERENCES flotte_vehicules(id) ON DELETE CASCADE,
  type_echeance flotte_type_echeance NOT NULL,
  libelle TEXT,
  date_debut_validite DATE,
  date_echeance DATE NOT NULL,
  seuil_alerte_jours INTEGER NOT NULL DEFAULT 30,
  reference TEXT,
  prestataire TEXT,
  montant_ht NUMERIC(14,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_flotte_echeances_seuil CHECK (seuil_alerte_jours >= 0),
  CONSTRAINT chk_flotte_echeances_dates CHECK (
    date_debut_validite IS NULL OR date_echeance >= date_debut_validite
  ),
  CONSTRAINT chk_flotte_echeances_montant CHECK (montant_ht IS NULL OR montant_ht >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_flotte_echeances_type_actif
  ON flotte_echeances (vehicule_id, type_echeance) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_echeances_vehicule
  ON flotte_echeances (vehicule_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_echeances_echeance
  ON flotte_echeances (entreprise_id, date_echeance) WHERE deleted_at IS NULL;

-- ── 4. Affectations (conducteur ET/OU chantier) ─────────────────────────────
CREATE TABLE IF NOT EXISTS flotte_affectations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  vehicule_id UUID NOT NULL REFERENCES flotte_vehicules(id) ON DELETE CASCADE,
  employe_id UUID REFERENCES employes(id) ON DELETE RESTRICT,
  chantier_id UUID REFERENCES chantiers(id) ON DELETE RESTRICT,
  statut flotte_statut_affectation NOT NULL DEFAULT 'en_cours',
  date_debut DATE NOT NULL,
  date_fin DATE,
  km_debut INTEGER,
  km_fin INTEGER,
  motif TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_flotte_affectations_cible CHECK (employe_id IS NOT NULL OR chantier_id IS NOT NULL),
  CONSTRAINT chk_flotte_affectations_dates CHECK (date_fin IS NULL OR date_fin >= date_debut),
  CONSTRAINT chk_flotte_affectations_km CHECK (
    km_fin IS NULL OR km_debut IS NULL OR km_fin >= km_debut
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_flotte_affectations_en_cours
  ON flotte_affectations (vehicule_id) WHERE statut = 'en_cours' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_affectations_vehicule
  ON flotte_affectations (vehicule_id, date_debut) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_affectations_employe
  ON flotte_affectations (employe_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_affectations_chantier
  ON flotte_affectations (chantier_id) WHERE deleted_at IS NULL;

-- ── 5. Entretiens / maintenance ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flotte_entretiens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  vehicule_id UUID NOT NULL REFERENCES flotte_vehicules(id) ON DELETE CASCADE,
  type_entretien flotte_type_entretien NOT NULL DEFAULT 'revision',
  date_entretien DATE NOT NULL,
  kilometrage INTEGER,
  description TEXT NOT NULL,
  prestataire TEXT,
  fournisseur_id UUID REFERENCES fournisseurs(id) ON DELETE SET NULL,
  cout_ht NUMERIC(14,2) NOT NULL DEFAULT 0,
  cout_tva NUMERIC(14,2),
  cout_ttc NUMERIC(14,2),
  prochaine_echeance_km INTEGER,
  prochaine_echeance_date DATE,
  garantie BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_flotte_entretiens_cout CHECK (cout_ht >= 0),
  CONSTRAINT chk_flotte_entretiens_km CHECK (kilometrage IS NULL OR kilometrage >= 0)
);

CREATE INDEX IF NOT EXISTS idx_flotte_entretiens_vehicule
  ON flotte_entretiens (vehicule_id, date_entretien) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_entretiens_fournisseur
  ON flotte_entretiens (fournisseur_id);

-- ── 6. Sinistres ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flotte_sinistres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  vehicule_id UUID NOT NULL REFERENCES flotte_vehicules(id) ON DELETE CASCADE,
  employe_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  numero_sinistre TEXT,
  date_sinistre DATE NOT NULL,
  lieu TEXT,
  description TEXT,
  responsabilite flotte_responsabilite_sinistre NOT NULL DEFAULT 'indeterminee',
  tiers_implique BOOLEAN NOT NULL DEFAULT false,
  montant_dommages_ht NUMERIC(14,2),
  franchise_ht NUMERIC(14,2),
  indemnisation_ht NUMERIC(14,2),
  clos BOOLEAN NOT NULL DEFAULT false,
  date_cloture DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_flotte_sinistres_montants CHECK (
    (montant_dommages_ht IS NULL OR montant_dommages_ht >= 0)
    AND (franchise_ht IS NULL OR franchise_ht >= 0)
    AND (indemnisation_ht IS NULL OR indemnisation_ht >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_flotte_sinistres_vehicule
  ON flotte_sinistres (vehicule_id, date_sinistre) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_sinistres_employe ON flotte_sinistres (employe_id);

-- ── 7. Pleins de carburant / recharges ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS flotte_pleins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  vehicule_id UUID NOT NULL REFERENCES flotte_vehicules(id) ON DELETE CASCADE,
  employe_id UUID REFERENCES employes(id) ON DELETE SET NULL,
  date_plein DATE NOT NULL,
  kilometrage INTEGER NOT NULL,
  volume_litres NUMERIC(8,2),
  energie_kwh NUMERIC(8,2),
  prix_ht NUMERIC(10,2) NOT NULL DEFAULT 0,
  prix_ttc NUMERIC(10,2),
  plein_complet BOOLEAN NOT NULL DEFAULT true,
  station TEXT,
  numero_carte_carburant BYTEA,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_flotte_pleins_km CHECK (kilometrage >= 0),
  CONSTRAINT chk_flotte_pleins_prix CHECK (prix_ht >= 0),
  CONSTRAINT chk_flotte_pleins_volume CHECK (volume_litres IS NULL OR volume_litres > 0),
  CONSTRAINT chk_flotte_pleins_qte CHECK (volume_litres IS NOT NULL OR energie_kwh IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_flotte_pleins_vehicule
  ON flotte_pleins (vehicule_id, kilometrage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_pleins_date ON flotte_pleins (entreprise_id, date_plein);

-- ── 8. Documents (GED véhicule — fichiers en MinIO) ─────────────────────────
CREATE TABLE IF NOT EXISTS flotte_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT,
  vehicule_id UUID NOT NULL REFERENCES flotte_vehicules(id) ON DELETE CASCADE,
  type_document flotte_type_document NOT NULL DEFAULT 'autre',
  libelle TEXT NOT NULL,
  minio_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  taille_bytes BIGINT,
  date_validite DATE,
  notes TEXT,
  echeance_id UUID REFERENCES flotte_echeances(id) ON DELETE SET NULL,
  entretien_id UUID REFERENCES flotte_entretiens(id) ON DELETE SET NULL,
  sinistre_id UUID REFERENCES flotte_sinistres(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_flotte_documents_taille CHECK (taille_bytes IS NULL OR taille_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_flotte_documents_vehicule
  ON flotte_documents (vehicule_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flotte_documents_echeance ON flotte_documents (echeance_id);
CREATE INDEX IF NOT EXISTS idx_flotte_documents_entretien ON flotte_documents (entretien_id);
CREATE INDEX IF NOT EXISTS idx_flotte_documents_sinistre ON flotte_documents (sinistre_id);

-- ── 9. Triggers updated_at (toutes les tables) ──────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'flotte_vehicules','flotte_echeances','flotte_affectations','flotte_entretiens',
    'flotte_sinistres','flotte_pleins','flotte_documents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ── 10. Héritage entreprise_id depuis le véhicule parent (filles, cf. 0044) ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'flotte_echeances','flotte_affectations','flotte_entretiens',
    'flotte_sinistres','flotte_pleins','flotte_documents'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_inherit_entreprise_id_%s ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_inherit_entreprise_id_%s BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION trg_inherit_entreprise_id(''flotte_vehicules'', ''vehicule_id'')',
      t, t
    );
  END LOOP;
END $$;

-- ── 11. RLS tenant (p_tenant) + GRANT app_rw (toutes les tables) ────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'flotte_vehicules','flotte_echeances','flotte_affectations','flotte_entretiens',
    'flotte_sinistres','flotte_pleins','flotte_documents'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS p_tenant ON %I', t);
    EXECUTE format(
      'CREATE POLICY p_tenant ON %I AS PERMISSIVE FOR ALL TO app_rw '
      || 'USING (entreprise_id = current_setting(''app.current_entreprise_id'', true)::uuid) '
      || 'WITH CHECK (entreprise_id = current_setting(''app.current_entreprise_id'', true)::uuid)',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_rw', t);
  END LOOP;
END $$;

COMMIT;
