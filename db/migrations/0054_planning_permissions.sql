-- 0054_planning_permissions.sql
-- Permissions L2 du module Planning (cf. migration 0021_rbac_granulaire.sql).
-- Ordres 264/268 : insère Planning entre Chantiers (240-260) et RH (270+),
-- pour que la matrice de /administration/roles affiche Planning juste après Chantiers.
--
-- Affectations par défaut (alignées sur Chantiers) :
--   PLANNING_READ  → tous les rôles tenant sauf super_admin (mirroir CHANTIERS_READ),
--   PLANNING_WRITE → admin + chef_chantier + conducteur_travaux (mirroir CHANTIERS_WRITE).
--
-- Migration idempotente : ON CONFLICT DO NOTHING sur les deux INSERTS.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES
  ('PLANNING_READ', 'Consulter le planning',
   'Voir le diagramme de Gantt d''un chantier (tâches, jalons, dépendances, équipe).',
   'Planning', NULL, 264),
  ('PLANNING_WRITE', 'Modifier le planning',
   'Modifier dates, avancement, jalons, dépendances et l''affectation des ouvriers/heures.',
   'Planning', NULL, 268)
ON CONFLICT (code) DO NOTHING;

-- PLANNING_READ → tous les rôles tenant non super_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'PLANNING_READ'
  AND r.code IN (
    'admin', 'acheteur', 'chef_chantier', 'comptable',
    'conducteur_travaux', 'lecture_seule', 'ouvrier', 'rh'
  )
ON CONFLICT DO NOTHING;

-- PLANNING_WRITE → admin + chef_chantier + conducteur_travaux
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'PLANNING_WRITE'
  AND r.code IN ('admin', 'chef_chantier', 'conducteur_travaux')
ON CONFLICT DO NOTHING;

COMMIT;
