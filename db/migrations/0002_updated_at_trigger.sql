-- 0002_updated_at_trigger.sql
-- Objectif : fonction Postgres + trigger pour maintenir updated_at automatiquement
-- À utiliser sur toutes les tables métier qui ont une colonne `updated_at TIMESTAMPTZ`.
-- Évite les oublis applicatifs et centralise la logique de timestamp.
--
-- À appliquer en superuser ou en app_migrator après le 0001.
-- Idempotent : CREATE OR REPLACE pour la fonction, DROP/CREATE pour les triggers.

-- =================================================================
-- 1. Fonction générique
-- =================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- 2. Appliquer à la table utilisateurs (seule table métier en M1)
-- =================================================================
-- Pour les nouvelles tables M2+, ajouter ici (ou créer une nouvelle migration).

DROP TRIGGER IF EXISTS trg_utilisateurs_updated_at ON utilisateurs;
CREATE TRIGGER trg_utilisateurs_updated_at
  BEFORE UPDATE ON utilisateurs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- =================================================================
-- Notes pour M2+
-- =================================================================
-- Quand on crée une nouvelle table métier avec `updated_at`, ajouter :
--
--   CREATE TRIGGER trg_<table>_updated_at
--     BEFORE UPDATE ON <table>
--     FOR EACH ROW
--     EXECUTE FUNCTION trigger_set_updated_at();
--
-- Ne PAS l'appliquer sur les tables Better Auth (user, session, etc.) :
-- Better Auth gère lui-même ses timestamps.
