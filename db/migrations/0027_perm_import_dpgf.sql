-- 0027_perm_import_dpgf.sql
-- Permission atomique pour l'import d'un DPGF (Décomposition du Prix Global
-- et Forfaitaire). Jusqu'ici l'action était gardée par appartenance au rôle
-- (lib/commercial/permissions.ts > ROLES_COMMERCIAL_WRITE). On bascule sur
-- une permission cochable dans la matrice /administration/roles.
--
-- Premier check L2 réellement enforcé du projet : couplé à un helper
-- `requirePermission()` côté Node (lib/auth/guards.ts). Le seed conserve la
-- politique actuelle (admin + conducteur_travaux + comptable) — aucune
-- régression de comportement à la migration.
--
-- Idempotente.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES (
  'COMMERCIAL_DEVIS_IMPORT_DPGF',
  'Importer un DPGF',
  'Importer un Décomposition du Prix Global et Forfaitaire (Excel) pour pré-remplir les lignes d''un devis.',
  'Commercial',
  'Devis',
  205
)
ON CONFLICT (code) DO NOTHING;

-- Grants par défaut : équivalent du périmètre ROLES_COMMERCIAL_WRITE actuel.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'COMMERCIAL_DEVIS_IMPORT_DPGF'
  AND r.code IN ('admin', 'conducteur_travaux', 'comptable')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
