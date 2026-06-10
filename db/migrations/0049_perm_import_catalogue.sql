-- 0049_perm_import_catalogue.sql
-- Permission atomique pour l'import d'une base d'articles fournisseur (Excel)
-- depuis la fiche fournisseur. Génère :
--   - N articles dans le catalogue (skip si code déjà existant)
--   - Familles manquantes à la volée (parent NULL = racine)
--   - Unités manquantes à la volée (type 'autre')
--   - 1 grille tarifaire pour le fournisseur, contenant l'ensemble des lignes
--     importées avec leur prix.
--
-- Pattern identique à 0027_perm_import_dpgf.sql : permission cochable dans
-- /administration/roles, seed équivalent au périmètre ROLES_CATALOGUE_WRITE
-- (admin + conducteur_travaux + acheteur).
--
-- Idempotente.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES (
  'CATALOGUE_IMPORT_FOURNISSEUR',
  'Importer un catalogue fournisseur',
  'Importer une base d''articles + prix (Excel) depuis la fiche fournisseur. Crée une nouvelle grille tarifaire pour le fournisseur, et complète au passage les articles / familles / unités manquants.',
  'Catalogue',
  'Articles',
  150
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'CATALOGUE_IMPORT_FOURNISSEUR'
  AND r.code IN ('admin', 'conducteur_travaux', 'acheteur')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
