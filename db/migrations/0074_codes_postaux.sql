-- 0074_codes_postaux.sql
-- Référentiel GÉOGRAPHIQUE : base officielle des codes postaux ↔ communes.
--
-- Source : « Base officielle des codes postaux » de La Poste (data.gouv.fr,
-- jeu laposte-hexasmal), enrichie des centroïdes de communes via l'API
-- officielle geo.api.gouv.fr (IGN/Etalab). Données open data (Licence Ouverte),
-- téléchargées UNE FOIS et chargées en local — aucune dépendance réseau au
-- runtime (cf. exigence d'autonomie du projet).
--
-- Table GLOBALE (pas de `entreprise_id`) : c'est un référentiel partagé par
-- tous les tenants, au même titre que `unites`. Donc PAS de RLS tenant : on
-- n'active jamais ROW LEVEL SECURITY dessus (sinon app_rw, qui pose un GUC
-- tenant, n'y verrait rien). app_rw reçoit SELECT/INSERT/UPDATE/DELETE
-- automatiquement via `ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator`
-- (migration 0001) puisque cette migration est appliquée en tant
-- qu'app_migrator. Un GRANT explicite est ajouté par sécurité (idempotent).
--
-- Chargement des données : voir db/seeds/codes_postaux.sql (généré par
-- `pnpm db:seed:codes-postaux`) ou l'échantillon db/seeds/codes_postaux.sample.sql.
--
-- Migration idempotente (IF NOT EXISTS partout).

BEGIN;

CREATE TABLE IF NOT EXISTS codes_postaux (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Code postal à 5 chiffres (ex : 69001). Un même code postal peut couvrir
  -- plusieurs communes ; une commune peut avoir plusieurs codes postaux.
  code_postal           varchar(5)  NOT NULL,
  -- Code commune INSEE (5 caractères, ex : 69381, 2A004 en Corse).
  code_commune_insee    varchar(5)  NOT NULL,
  -- Nom de la commune (forme La Poste : majuscules sans accents).
  commune               text        NOT NULL,
  -- Libellé d'acheminement = ligne « ville » normalisée à imprimer sur le pli.
  libelle_acheminement  text        NOT NULL,
  -- Lieu-dit / commune déléguée (Ligne 5 La Poste), souvent vide.
  ligne_5               text,
  -- Département dérivé du code INSEE (2 car., ou 2A/2B Corse, ou 971+ DOM).
  departement           varchar(3)  NOT NULL,
  -- Centroïde de la commune (nullable : enrichissement geo.api.gouv.fr).
  latitude              numeric(9, 6),
  longitude             numeric(9, 6),
  -- Colonne de recherche normalisée (MAJUSCULES, sans accent, ponctuation →
  -- espace) : alimente l'autocomplétion par préfixe sur le nom de commune.
  recherche             text        NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

-- Recherche par code postal (préfixe « 6900% »).
CREATE INDEX IF NOT EXISTS idx_codes_postaux_cp
  ON codes_postaux (code_postal varchar_pattern_ops);

-- Recherche par nom de commune (préfixe « LYON% ») — text_pattern_ops requis
-- pour que LIKE 'x%' utilise l'index (collation non-C).
CREATE INDEX IF NOT EXISTS idx_codes_postaux_recherche
  ON codes_postaux (recherche text_pattern_ops);

-- Jointure/enrichissement par code INSEE.
CREATE INDEX IF NOT EXISTS idx_codes_postaux_insee
  ON codes_postaux (code_commune_insee);

-- Une ligne = un triplet (code postal, commune INSEE, ligne 5) unique.
-- coalesce sur ligne_5 pour traiter NULL comme '' dans la contrainte.
CREATE UNIQUE INDEX IF NOT EXISTS uq_codes_postaux
  ON codes_postaux (code_postal, code_commune_insee, (coalesce(ligne_5, '')));

-- Filet de sécurité explicite (les ALTER DEFAULT PRIVILEGES de 0001 couvrent
-- déjà le cas, mais on ne dépend pas de l'ordre d'application).
GRANT SELECT, INSERT, UPDATE, DELETE ON codes_postaux TO app_rw;

COMMIT;
