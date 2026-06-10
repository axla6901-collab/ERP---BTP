-- 0061_pointage_offline_idempotence.sql
-- M5.5 : pointage offline (PWA). Idempotence de la synchronisation terrain.
-- Schéma TypeScript miroir : db/schema/pointages.ts
-- ADR : 004-offline-pointage (architecture), 015-pwa-sw-manuel (outillage SW)
-- Appliquée via app_migrator. Idempotente.
--
-- Contexte :
--   Chaque pointage saisi hors-ligne génère un `client_uuid` (UUID v7) côté
--   client, qui sert d'idempotency key. L'endpoint POST /api/v1/pointages fait
--   `INSERT ... ON CONFLICT (client_uuid) DO NOTHING` : une double soumission
--   (retry réseau, re-flush de l'outbox) est un succès silencieux, pas un doublon.
--   `server_received_at` tamponne l'heure serveur de réception (l'horloge du
--   smartphone pouvant être décalée — cf. ADR-004 §Résolution de conflits, Cas 4).
--
--   L'unicité métier reste portée par uq_pointages_employe_date_chantier_type
--   (créé en 0011) : deux appareils saisissant le même (employé, date, chantier,
--   type) avec des client_uuid différents → la 2e insertion est rejetée, ce que
--   l'API mappe en `doublon_metier` pour l'outbox (statut `rejected`).
--
-- Aucun GRANT ici : app_rw possède déjà les droits DML sur `pointages` au niveau
-- table (les colonnes ajoutées en héritent — cf. 0001_db_roles.sql).

BEGIN;

ALTER TABLE pointages
  ADD COLUMN IF NOT EXISTS client_uuid UUID,
  ADD COLUMN IF NOT EXISTS server_received_at TIMESTAMPTZ;

-- Index UNIQUE non partiel : NULL n'entre jamais en conflit (lignes historiques
-- importées avant M5.5 → client_uuid NULL, autant qu'on veut). Sur les valeurs
-- non NULL, garantit l'idempotence et permet le `ON CONFLICT (client_uuid)`.
-- Volontairement SANS filtre `WHERE deleted_at IS NULL` : l'idempotence doit
-- survivre à un soft-delete (un re-flush d'outbox ne doit pas recréer une ligne
-- supprimée côté serveur).
CREATE UNIQUE INDEX IF NOT EXISTS uq_pointages_client_uuid
  ON pointages (client_uuid);

COMMIT;
