-- 0037_statut_devis_workflow.sql
-- Refonte du workflow de statut des devis : passage d'un cycle simplifié
-- (brouillon/envoye/accepte/refuse/expire) à un cycle complet à 8 états
-- inspiré du projet « Gestion des devis SAV / compter-chiffrage ».
--
-- Nouvelle machine à états :
--   brouillon → en_validation, annule
--   en_validation → valide, refuse, annule
--   refuse → en_validation, annule
--   valide → envoye, annule
--   envoye → gagne, perdu, annule
--   gagne / perdu / annule : terminaux
--
-- Mapping des anciennes valeurs (préservation des devis existants) :
--   brouillon → brouillon
--   envoye    → envoye
--   accepte   → gagne   (client a accepté = devis gagné)
--   refuse    → perdu   (client a refusé = devis perdu)
--   expire    → perdu   (délai dépassé sans réponse = perdu)
--
-- La transition en_validation → valide / refuse est gatée côté code par la
-- permission RBAC `COMMERCIAL_DEVIS_VALIDATE` déjà seedée depuis la
-- migration 0021_rbac_granulaire.sql (accordée à admin / comptable /
-- conducteur_travaux par défaut).
--
-- Idempotente : utilise rename + recreate du type, contrôle par existence
-- des anciennes/nouvelles valeurs avant action.

BEGIN;

-- 1. Recréation propre du type enum (Postgres n'autorise pas le DROP VALUE)
DO $$
BEGIN
  -- Si le nouveau type existe déjà (migration rejouée), on saute
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'statut_devis' AND e.enumlabel = 'en_validation'
  ) THEN
    -- Renomme l'ancien type
    ALTER TYPE statut_devis RENAME TO statut_devis_legacy;

    -- Crée le nouveau type
    CREATE TYPE statut_devis AS ENUM (
      'brouillon',
      'en_validation',
      'refuse',
      'valide',
      'envoye',
      'gagne',
      'perdu',
      'annule'
    );

    -- Convertit la colonne devis.statut avec mapping des anciennes valeurs
    ALTER TABLE devis
      ALTER COLUMN statut DROP DEFAULT,
      ALTER COLUMN statut TYPE statut_devis USING (
        CASE statut::text
          WHEN 'brouillon' THEN 'brouillon'::statut_devis
          WHEN 'envoye'    THEN 'envoye'::statut_devis
          WHEN 'accepte'   THEN 'gagne'::statut_devis
          WHEN 'refuse'    THEN 'perdu'::statut_devis
          WHEN 'expire'    THEN 'perdu'::statut_devis
          ELSE 'brouillon'::statut_devis
        END
      ),
      ALTER COLUMN statut SET DEFAULT 'brouillon';

    -- Drop l'ancien type
    DROP TYPE statut_devis_legacy;
  END IF;
END $$;

COMMIT;
