-- 0034_perm_postes_internes.sql
-- Permission atomique pour gérer les postes internes ventilés d'un devis
-- (frais généraux, aléas, marge…). Ces postes sont sensibles : ils
-- gonflent les PU effectifs sans être visibles du client, et leur édition
-- ne devrait être ouverte qu'au conducteur de travaux / direction.
--
-- Politique d'enforcement (cf. lib/commercial/devis.ts) :
--   - Sans cette permission, l'éditeur des postes internes est masqué dans
--     le DevisEditor.
--   - À la création d'un devis : un utilisateur sans permission verra ses
--     `postesInternes` silencieusement filtrés à [] côté server action.
--   - À la mise à jour : les postes existants sont préservés à l'identique
--     (la server action ignore l'input et relit ceux en base), de sorte
--     qu'un user sans droit puisse éditer les autres champs du devis sans
--     détruire les postes saisis par un utilisateur autorisé.
--
-- Seed par défaut : équivalent du périmètre ROLES_COMMERCIAL_WRITE actuel
-- (admin + conducteur_travaux + comptable) — aucune régression à la
-- migration. Le droit est dé-cochable via /administration/roles.
--
-- Idempotente.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES (
  'COMMERCIAL_DEVIS_POSTES_INTERNES',
  'Gérer les postes internes ventilés',
  'Ajouter/modifier les postes internes ventilés (frais généraux, aléas, marge…) d''un devis. Ces postes sont invisibles pour le client mais gonflent les PU effectifs.',
  'Commercial',
  'Devis',
  206
)
ON CONFLICT (code) DO NOTHING;

-- Grants par défaut : équivalent du périmètre ROLES_COMMERCIAL_WRITE actuel.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE p.code = 'COMMERCIAL_DEVIS_POSTES_INTERNES'
  AND r.code IN ('admin', 'conducteur_travaux', 'comptable')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
