-- 0063_compte_prorata_permissions.sql
-- Permissions L2 du module Compte prorata (cf. 0021_rbac_granulaire.sql / 0054_planning_permissions.sql).
-- Ordres 261/262/263 : insère Compte prorata entre Chantiers (240-260) et Planning (264+),
-- pour que la matrice de /administration/roles l'affiche juste après Chantiers.
--
-- Affectations par défaut :
--   COMPTE_PRORATA_READ   → tous les rôles tenant sauf super_admin (miroir CHANTIERS_READ),
--   COMPTE_PRORATA_WRITE  → admin + chef_chantier + conducteur_travaux (miroir CHANTIERS_WRITE),
--   COMPTE_PRORATA_ARRETE → admin + conducteur_travaux (droit sensible : verrouillage du compte).
--
-- Migration idempotente : ON CONFLICT DO NOTHING sur les INSERTS.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES
  ('COMPTE_PRORATA_READ', 'Consulter le compte prorata',
   'Voir les participants, dépenses communes, bilan et soldes du compte prorata d''un chantier.',
   'Compte prorata', NULL, 261),
  ('COMPTE_PRORATA_WRITE', 'Modifier le compte prorata',
   'Ajouter / modifier participants, dépenses communes et avances du compte prorata.',
   'Compte prorata', NULL, 262),
  ('COMPTE_PRORATA_ARRETE', 'Arrêter le compte prorata',
   'Arrêter / clôturer le compte prorata (verrouillage et génération du snapshot d''arrêté).',
   'Compte prorata', NULL, 263)
ON CONFLICT (code) DO NOTHING;

-- COMPTE_PRORATA_READ → tous les rôles tenant non super_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'COMPTE_PRORATA_READ'
  AND r.code IN (
    'admin', 'acheteur', 'chef_chantier', 'comptable',
    'conducteur_travaux', 'lecture_seule', 'ouvrier', 'rh'
  )
ON CONFLICT DO NOTHING;

-- COMPTE_PRORATA_WRITE → admin + chef_chantier + conducteur_travaux
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'COMPTE_PRORATA_WRITE'
  AND r.code IN ('admin', 'chef_chantier', 'conducteur_travaux')
ON CONFLICT DO NOTHING;

-- COMPTE_PRORATA_ARRETE → admin + conducteur_travaux
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'COMPTE_PRORATA_ARRETE'
  AND r.code IN ('admin', 'conducteur_travaux')
ON CONFLICT DO NOTHING;

COMMIT;
