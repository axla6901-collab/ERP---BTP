-- 0042_rescope_unique_indexes.sql
-- Passage des contraintes UNIQUE métier d'un scope global à un scope per-entreprise.
--
-- Pour chaque table : DROP de l'ancien index unique (qui couvrait toute la table)
-- et CREATE d'un nouvel index unique partiel sur (entreprise_id, <colonne>)
-- avec WHERE deleted_at IS NULL.
--
-- Toutes les opérations utilisent IF EXISTS / IF NOT EXISTS pour rester idempotentes.

BEGIN;

-- ============================ Catalogue ============================

-- familles : code unique par entreprise
DROP INDEX IF EXISTS uq_familles_code_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_familles_entreprise_code_active
  ON familles (entreprise_id, code) WHERE deleted_at IS NULL;

-- articles : code unique par entreprise (l'index porte le nom historique uq_articles_code_active)
DROP INDEX IF EXISTS uq_articles_code_active;
DROP INDEX IF EXISTS uq_articles_v2_code_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_articles_entreprise_code_active
  ON articles (entreprise_id, code) WHERE deleted_at IS NULL;

-- fournisseurs : code + siret unique par entreprise
DROP INDEX IF EXISTS uq_fournisseurs_code_active;
DROP INDEX IF EXISTS uq_fournisseurs_siret_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fournisseurs_entreprise_code_active
  ON fournisseurs (entreprise_id, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fournisseurs_entreprise_siret_active
  ON fournisseurs (entreprise_id, siret) WHERE deleted_at IS NULL AND siret IS NOT NULL;

-- ============================ Tiers (historique) ============================

-- sous_traitants : code + siret unique par entreprise
DROP INDEX IF EXISTS uq_sous_traitants_code_active;
DROP INDEX IF EXISTS uq_sous_traitants_siret_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sous_traitants_entreprise_code_active
  ON sous_traitants (entreprise_id, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sous_traitants_entreprise_siret_active
  ON sous_traitants (entreprise_id, siret) WHERE deleted_at IS NULL AND siret IS NOT NULL;

-- ============================ Commercial ============================

-- clients : code + siret unique par entreprise
DROP INDEX IF EXISTS uq_clients_code_active;
DROP INDEX IF EXISTS uq_clients_siret_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_entreprise_code_active
  ON clients (entreprise_id, code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_entreprise_siret_active
  ON clients (entreprise_id, siret) WHERE deleted_at IS NULL AND siret IS NOT NULL;

-- devis : numéro unique par entreprise
DROP INDEX IF EXISTS uq_devis_numero_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_devis_entreprise_numero_active
  ON devis (entreprise_id, numero) WHERE deleted_at IS NULL;

-- ============================ Chantiers ============================

DROP INDEX IF EXISTS uq_chantiers_numero_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chantiers_entreprise_numero_active
  ON chantiers (entreprise_id, numero) WHERE deleted_at IS NULL;

-- ============================ RH ============================

DROP INDEX IF EXISTS uq_employes_matricule_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employes_entreprise_matricule_active
  ON employes (entreprise_id, matricule) WHERE deleted_at IS NULL;

-- ============================ Facturation ============================

-- factures.numero : la contrainte UNIQUE column était auto-générée (factures_numero_key).
-- On la drop et on la remplace par un index partiel scopé par entreprise.
ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_numero_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_factures_entreprise_numero
  ON factures (entreprise_id, numero) WHERE deleted_at IS NULL;

-- ============================ Numérotation ============================

-- numeros_attribues : la séquence devient per-entreprise.
-- La contrainte uq_numeros_attribues_type_annee_seq est une CONSTRAINT (cf. 0004) → DROP via ALTER TABLE.
ALTER TABLE numeros_attribues DROP CONSTRAINT IF EXISTS uq_numeros_attribues_type_annee_seq;
CREATE UNIQUE INDEX IF NOT EXISTS uq_numeros_attribues_entreprise_type_annee_seq
  ON numeros_attribues (entreprise_id, type_doc, annee, sequence);

-- ============================ Référencement Tiers (0028-0032) ============================
-- Défensif : skip si les tables n'existent pas (module non encore appliqué).

DO $$ BEGIN
  IF to_regclass('public.societes') IS NOT NULL THEN
    DROP INDEX IF EXISTS uq_societes_code_active;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_societes_entreprise_code_active
      ON societes (entreprise_id, code) WHERE deleted_at IS NULL;
  END IF;

  IF to_regclass('public.tiers') IS NOT NULL THEN
    DROP INDEX IF EXISTS uq_tiers_code_active;
    DROP INDEX IF EXISTS uq_tiers_siret_active;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tiers_entreprise_code_active
      ON tiers (entreprise_id, code) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tiers_entreprise_siret_active
      ON tiers (entreprise_id, siret) WHERE deleted_at IS NULL AND siret IS NOT NULL;
  END IF;

  IF to_regclass('public.corps_etat') IS NOT NULL THEN
    DROP INDEX IF EXISTS uq_corps_etat_code_active;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_corps_etat_entreprise_code_active
      ON corps_etat (entreprise_id, code) WHERE deleted_at IS NULL;
  END IF;

  IF to_regclass('public.natures_document') IS NOT NULL THEN
    DROP INDEX IF EXISTS uq_natures_document_code_active;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_natures_document_entreprise_code_active
      ON natures_document (entreprise_id, code) WHERE deleted_at IS NULL;
  END IF;
END $$;

COMMIT;
