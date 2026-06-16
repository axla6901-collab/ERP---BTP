-- 0077_flotte_permissions.sql
-- Permissions L2 du module Flotte automobile (cf. 0021_rbac_granulaire / 0054_planning_permissions).
-- Ordres 290-298 : insère Flotte après Sous-traitance dans la matrice /administration/roles.
--
-- Affectations par défaut :
--   FLOTTE_READ              → tous les rôles tenant sauf super_admin (consultation),
--   FLOTTE_WRITE             → admin + acheteur (gestion du parc),
--   FLOTTE_AFFECTATION_WRITE → admin + acheteur + conducteur_travaux + chef_chantier (terrain).
--
-- Migration idempotente : ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES
  ('FLOTTE_READ', 'Consulter la flotte',
   'Voir les véhicules, échéances, entretiens, affectations, sinistres et documents.',
   'Flotte', NULL, 290),
  ('FLOTTE_WRITE', 'Gérer la flotte',
   'Créer/modifier véhicules, échéances, entretiens, sinistres et documents.',
   'Flotte', NULL, 294),
  ('FLOTTE_AFFECTATION_WRITE', 'Gérer les affectations de véhicules',
   'Affecter un véhicule à un conducteur et/ou un chantier (gestion terrain).',
   'Flotte', NULL, 298)
ON CONFLICT (code) DO NOTHING;

-- FLOTTE_READ → tous les rôles tenant non super_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'FLOTTE_READ'
  AND r.code IN (
    'admin', 'acheteur', 'chef_chantier', 'comptable',
    'conducteur_travaux', 'lecture_seule', 'ouvrier', 'rh', 'assistant_travaux'
  )
ON CONFLICT DO NOTHING;

-- FLOTTE_WRITE → admin + acheteur
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'FLOTTE_WRITE'
  AND r.code IN ('admin', 'acheteur')
ON CONFLICT DO NOTHING;

-- FLOTTE_AFFECTATION_WRITE → admin + acheteur + conducteur_travaux + chef_chantier
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'FLOTTE_AFFECTATION_WRITE'
  AND r.code IN ('admin', 'acheteur', 'conducteur_travaux', 'chef_chantier')
ON CONFLICT DO NOTHING;

COMMIT;
