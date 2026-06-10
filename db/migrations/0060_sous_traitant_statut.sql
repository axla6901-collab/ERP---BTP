-- 0060_sous_traitant_statut.sql
-- Module Tiers : statut d'agrément des sous-traitants.
-- Schéma TypeScript miroir : db/schema/tiers.ts (enum statutSousTraitant).
-- Libellés FR : lib/validation/tiers.ts (STATUT_SOUS_TRAITANT_LABELS).
--
-- Cycle de vie référencement BTP, DISTINCT du booléen `actif` (archivage) :
--   a_qualifier        → créé, pas encore évalué (état initial)
--   en_cours_agrement  → dossier d'agrément en cours
--   agree              → agréé / référencé
--   suspendu           → agrément suspendu (ex. documents périmés)
--   refuse             → agrément refusé
--
-- Idempotente (CREATE TYPE IF NOT EXISTS n'existe pas → garde via DO bloc).

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statut_sous_traitant') THEN
    CREATE TYPE statut_sous_traitant AS ENUM (
      'a_qualifier',
      'en_cours_agrement',
      'agree',
      'suspendu',
      'refuse'
    );
  END IF;
END$$;

ALTER TABLE sous_traitants
  ADD COLUMN IF NOT EXISTS statut statut_sous_traitant NOT NULL DEFAULT 'a_qualifier';

-- Les sous-traitants déjà actifs sont supposés agréés ; les inactifs restent
-- au statut initial (à requalifier au prochain édit).
UPDATE sous_traitants
  SET statut = 'agree'
  WHERE actif = true
    AND statut = 'a_qualifier';

CREATE INDEX IF NOT EXISTS idx_sous_traitants_statut
  ON sous_traitants (statut) WHERE deleted_at IS NULL;

COMMIT;
