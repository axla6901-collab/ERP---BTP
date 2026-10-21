-- 0080_test_sirh_permissions.sql
-- Permissions L2 du module « Test SIRH » (cf. 0021_rbac_granulaire / 0077_flotte_permissions).
-- Ordres 600-616 : place le module en fin de matrice /administration/roles.
--
-- Affectations par défaut (miroir de lib/test-sirh/permissions.ts) :
--   SIRH_READ           → admin, rh, comptable, conducteur_travaux, chef_chantier, assistant_travaux
--   SIRH_WRITE          → admin, rh                                  (gestion des données RH)
--   SIRH_VALIDATION     → admin, rh, conducteur_travaux, chef_chantier (absences, heures sup, frais)
--   SIRH_PAIE           → admin, rh, comptable                       (rémunérations, variables de paie)
--   SIRH_LIBRE_SERVICE  → tous les rôles tenant                      (espace salarié « Mon espace »)
--
-- Migration idempotente : ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre)
VALUES
  ('SIRH_READ', 'Consulter le SIRH',
   'Voir l''organisation, les collaborateurs, absences, temps, recrutement, entretiens, formations…',
   'Test SIRH', NULL, 600),
  ('SIRH_WRITE', 'Gérer le SIRH',
   'Créer/modifier les données RH : organisation, contrats, compteurs, référentiels, recrutement…',
   'Test SIRH', NULL, 604),
  ('SIRH_VALIDATION', 'Valider les demandes RH',
   'Approuver ou refuser les demandes d''absence, d''heures supplémentaires et les notes de frais.',
   'Test SIRH', NULL, 608),
  ('SIRH_PAIE', 'Accéder à la paie',
   'Voir les rémunérations, préparer et clôturer les variables de paie, exporter.',
   'Test SIRH', NULL, 612),
  ('SIRH_LIBRE_SERVICE', 'Espace salarié',
   'Consulter ses compteurs, demander une absence, déposer une note de frais (« Mon espace »).',
   'Test SIRH', NULL, 616)
ON CONFLICT (code) DO NOTHING;

-- SIRH_READ
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'SIRH_READ'
  AND r.code IN (
    'admin', 'rh', 'comptable', 'conducteur_travaux', 'chef_chantier', 'assistant_travaux'
  )
ON CONFLICT DO NOTHING;

-- SIRH_WRITE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'SIRH_WRITE'
  AND r.code IN ('admin', 'rh')
ON CONFLICT DO NOTHING;

-- SIRH_VALIDATION
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'SIRH_VALIDATION'
  AND r.code IN ('admin', 'rh', 'conducteur_travaux', 'chef_chantier')
ON CONFLICT DO NOTHING;

-- SIRH_PAIE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'SIRH_PAIE'
  AND r.code IN ('admin', 'rh', 'comptable')
ON CONFLICT DO NOTHING;

-- SIRH_LIBRE_SERVICE → tous les rôles tenant non super_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE p.code = 'SIRH_LIBRE_SERVICE'
  AND r.code IN (
    'admin', 'acheteur', 'chef_chantier', 'comptable',
    'conducteur_travaux', 'lecture_seule', 'ouvrier', 'rh', 'assistant_travaux'
  )
ON CONFLICT DO NOTHING;

COMMIT;
