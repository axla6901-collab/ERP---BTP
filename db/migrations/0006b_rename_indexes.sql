-- 0006b_rename_indexes.sql
-- Complément à 0006 : renomme les index legacy puis les v2 vers leurs noms canoniques.
-- À appliquer une seule fois après 0006_catalogue_refonte.sql.

DO $$
BEGIN
  -- Libérer les noms côté legacy
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_articles_code_active') THEN
    ALTER INDEX uq_articles_code_active RENAME TO uq_articles_code_active_legacy_2026_05_21;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_articles_famille' AND tablename = 'articles_legacy_2026_05_21') THEN
    ALTER INDEX idx_articles_famille RENAME TO idx_articles_famille_legacy_2026_05_21;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_articles_actif') THEN
    ALTER INDEX idx_articles_actif RENAME TO idx_articles_actif_legacy_2026_05_21;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'articles_pkey' AND tablename = 'articles_legacy_2026_05_21') THEN
    ALTER INDEX articles_pkey RENAME TO articles_pkey_legacy_2026_05_21;
  END IF;

  -- Promouvoir v2 aux noms canoniques
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_articles_v2_code_active') THEN
    ALTER INDEX uq_articles_v2_code_active RENAME TO uq_articles_code_active;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_articles_v2_famille') THEN
    ALTER INDEX idx_articles_v2_famille RENAME TO idx_articles_famille;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_articles_v2_type') THEN
    ALTER INDEX idx_articles_v2_type RENAME TO idx_articles_type;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'articles_v2_pkey') THEN
    ALTER INDEX articles_v2_pkey RENAME TO articles_pkey;
  END IF;

  -- Contraintes CHECK
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_articles_v2_code_format') THEN
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_code_format TO chk_articles_code_format;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_libelle_len TO chk_articles_libelle_len;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_densite TO chk_articles_densite;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_epaisseur TO chk_articles_epaisseur;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_long TO chk_articles_long;
    ALTER TABLE articles RENAME CONSTRAINT chk_articles_v2_larg TO chk_articles_larg;
  END IF;
END $$;
