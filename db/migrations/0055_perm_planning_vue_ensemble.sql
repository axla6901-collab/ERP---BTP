-- 0055_perm_planning_vue_ensemble.sql
-- Droit d'accès à la « Vue d'ensemble » multi-chantier du Planning (frise
-- transverse, 1 ligne par chantier, dépliable). La « Liste » reste ouverte à
-- tous les rôles ayant PLANNING_READ.
--
-- Ordre 266 : s'insère entre PLANNING_READ (264) et PLANNING_WRITE (268), donc
-- juste à côté dans la matrice de /administration/roles.
--
-- Affectation par défaut (vue de pilotage transverse) :
--   admin + conducteur_travaux + chef_chantier.
-- Éditable ensuite par rôle via /administration/roles.
--
-- Migration idempotente : ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES
  ('PLANNING_VUE_ENSEMBLE', 'Vue d''ensemble multi-chantier',
   'Accéder à la frise transverse listant tous les chantiers planifiés (1 ligne par projet, dépliable). Sans ce droit, seule la vue Liste est proposée.',
   'Planning', NULL, 266)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'PLANNING_VUE_ENSEMBLE'
  AND r.code IN ('admin', 'conducteur_travaux', 'chef_chantier')
ON CONFLICT DO NOTHING;

COMMIT;
