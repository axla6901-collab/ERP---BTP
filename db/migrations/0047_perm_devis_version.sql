-- 0047_perm_devis_version.sql
-- Permission atomique pour la duplication d'un devis EN TANT QUE NOUVELLE
-- VERSION pour le MÊME client.
--
-- Discrimination métier :
--   • Dupliquer pour un AUTRE client = action commerciale standard,
--     gardée par ROLES_COMMERCIAL_WRITE (déjà en place via creerDevis).
--   • Dupliquer pour le MÊME client = créer une « v2/v3… » du devis →
--     impact commercial (négociation, traçabilité), réservé aux rôles
--     habilités via cette nouvelle permission.
--
-- Idempotente.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES (
  'COMMERCIAL_DEVIS_VERSION',
  'Gérer les versions d''un devis',
  'Dupliquer un devis comme nouvelle version pour le même client (négociation, révision). La duplication vers un autre client reste libre pour tous les utilisateurs en écriture commerciale.',
  'Commercial',
  'Devis',
  210
)
ON CONFLICT (code) DO NOTHING;

-- Grants par défaut : équivalent du périmètre ROLES_COMMERCIAL_WRITE actuel.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'COMMERCIAL_DEVIS_VERSION'
  AND r.code IN ('admin', 'conducteur_travaux', 'comptable')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
