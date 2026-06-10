-- 0032_tier_documents_relances.sql
-- Documents administratifs attachés à un tier + traces des relances de
-- l'agrément (FEB_Contrôle Artisans.docx §III, schéma PDF 04/03/2025).
--
-- - tier_documents : un enregistrement par document fourni par un tier.
--   Stockage du fichier en MinIO via minio_key (cf. lib/storage/s3.ts).
--   La date_fin_validite est calculée à l'upload selon le mode_controle de
--   la nature_document associée (date_obtention + delai_validite_jours, ou
--   date d'expiration saisie pour les assurances).
--
-- - tier_agrement_relances : trace immuable des relances envoyées. Sert
--   à garantir l'idempotence du job cron et à reconstituer l'historique
--   pour les rapports.

BEGIN;

CREATE TYPE statut_document_tier AS ENUM (
  'en_attente_validation',  -- uploadé mais pas encore validé par l'AT
  'valide',                  -- validé par l'AT, dans la fenêtre de validité
  'expire',                  -- date_fin_validite dépassée
  'a_renouveler',            -- dans la fenêtre de relance avant expiration
  'refuse'                   -- rejeté par l'AT (motif renseigné)
);

CREATE TYPE contexte_relance_agrement AS ENUM (
  'agrement_initial',     -- 1er référencement, en attente des docs
  'renouvellement',       -- doc en fin de validité → demande renouvellement
  'retour_marche_signe'   -- marché envoyé, en attente du retour signé
);

CREATE TYPE niveau_relance_agrement AS ENUM (
  'r1',
  'r2',
  'r3',
  'escalade_manager'
);

CREATE TABLE tier_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  nature_document_id UUID NOT NULL REFERENCES natures_document(id) ON DELETE RESTRICT,
  -- Fichier
  minio_key TEXT,
  nom_fichier_origine TEXT,
  mime_type TEXT,
  taille_bytes BIGINT,
  -- Dates métier
  date_obtention DATE,
  date_fin_validite DATE,
  -- Statut + validation par l'AT
  statut statut_document_tier NOT NULL DEFAULT 'en_attente_validation',
  validated_at TIMESTAMPTZ,
  validated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  motif_refus TEXT,
  notes TEXT,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_tier_documents_taille
    CHECK (taille_bytes IS NULL OR taille_bytes > 0),
  CONSTRAINT chk_tier_documents_refus_motif
    CHECK ((statut <> 'refuse') OR (motif_refus IS NOT NULL AND char_length(motif_refus) > 0))
);

CREATE INDEX idx_tier_documents_tier
  ON tier_documents (tier_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tier_documents_nature
  ON tier_documents (nature_document_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tier_documents_validite
  ON tier_documents (date_fin_validite) WHERE deleted_at IS NULL;
CREATE INDEX idx_tier_documents_statut
  ON tier_documents (statut) WHERE deleted_at IS NULL;
CREATE INDEX idx_tier_documents_tier_nature
  ON tier_documents (tier_id, nature_document_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_tier_documents_updated_at
  BEFORE UPDATE ON tier_documents
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE tier_agrement_relances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  -- document concerné (NULL pour les relances « générales » d'agrément initial).
  tier_document_id UUID REFERENCES tier_documents(id) ON DELETE SET NULL,
  contexte contexte_relance_agrement NOT NULL,
  niveau niveau_relance_agrement NOT NULL,
  envoye_le TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Jour d'envoi (UTC) matérialisé : le DEFAULT est évalué à l'INSERT (autorisé),
  -- ce qui permet d'indexer une colonne plane IMMUTABLE pour l'idempotence cron.
  -- (envoye_le::date directement dans l'index n'est pas IMMUTABLE → refusé par PG.)
  jour_envoi DATE NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  destinataires TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  cc TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sujet TEXT NOT NULL,
  corps TEXT NOT NULL,
  -- Trace technique (smtp message-id si dispo, ou ID de la tâche cron)
  reference_externe TEXT
);

-- Idempotence du job cron : on n'envoie qu'une fois (tier, contexte, niveau, doc, jour).
-- Sans ça un cron déclenché toutes les heures spammerait. Date troncature jour
-- → la même relance ne peut pas partir deux fois dans la même journée pour le
-- même contexte+niveau+document.
CREATE UNIQUE INDEX uq_tier_agrement_relances_idempotence
  ON tier_agrement_relances (
    tier_id,
    contexte,
    niveau,
    COALESCE(tier_document_id, '00000000-0000-0000-0000-000000000000'::uuid),
    jour_envoi
  );

CREATE INDEX idx_tier_agrement_relances_tier
  ON tier_agrement_relances (tier_id, envoye_le DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  tier_documents, tier_agrement_relances
  TO app_rw;

COMMIT;
