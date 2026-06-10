-- 0033_rbac_tiers_referencement.sql
-- Ajout du rôle métier `assistant_travaux` (AT du docx) + permissions
-- atomiques pour le module Référencement & Agrément.
--
-- Permissions :
--   TIERS_DOCUMENTS_READ/WRITE/DELETE — gérer les documents administratifs.
--   TIERS_AGREMENT_STATUER            — valider/refuser un agrément manuel.
--   ADMIN_REFERENTIEL_TIERS_READ/WRITE/DELETE — administrer le référentiel
--     (corps d'état, natures de document, correspondance, sociétés, règles).
--
-- Idempotente (ON CONFLICT DO NOTHING partout).

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Rôle assistant_travaux
-- ─────────────────────────────────────────────────────────────

INSERT INTO roles (code, libelle, description, systeme, actif)
VALUES (
  'assistant_travaux',
  'Assistant·e travaux',
  'Validation des documents administratifs des sous-traitants, gestion de l''agrément, suivi des relances.',
  true,
  true
)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 2. Permissions atomiques
-- ─────────────────────────────────────────────────────────────

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre) VALUES
  -- Documents administratifs des tiers
  ('TIERS_DOCUMENTS_READ',
    'Consulter les documents administratifs',
    'Voir les documents (K-bis, URSSAF, assurances, etc.) des tiers.',
    'Tiers', 'Documents', 160),
  ('TIERS_DOCUMENTS_WRITE',
    'Ajouter/valider un document administratif',
    'Uploader, valider, refuser un document administratif d''un tier.',
    'Tiers', 'Documents', 161),
  ('TIERS_DOCUMENTS_DELETE',
    'Supprimer un document administratif',
    'Marquer un document comme supprimé (soft-delete).',
    'Tiers', 'Documents', 162),

  -- Agrément
  ('TIERS_AGREMENT_STATUER',
    'Statuer sur l''agrément d''un tier',
    'Valider, refuser ou suspendre l''agrément d''un sous-traitant.',
    'Tiers', 'Agrément', 165),

  -- Référentiel paramétrable (administrable cf. docx l.97 et l.155)
  ('ADMIN_REFERENTIEL_TIERS_READ',
    'Consulter le référentiel Tiers',
    'Voir corps d''état, natures de document, correspondance et règles sociétés.',
    'Administration', 'Référentiel Tiers', 425),
  ('ADMIN_REFERENTIEL_TIERS_WRITE',
    'Modifier le référentiel Tiers',
    'Ajouter/modifier corps d''état, natures de document, correspondance et règles sociétés.',
    'Administration', 'Référentiel Tiers', 426),
  ('ADMIN_REFERENTIEL_TIERS_DELETE',
    'Supprimer dans le référentiel Tiers',
    'Marquer comme supprimé un élément du référentiel.',
    'Administration', 'Référentiel Tiers', 427)
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Matrice rôle × permission
-- ─────────────────────────────────────────────────────────────

-- admin : toutes
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin'
  AND p.code IN (
    'TIERS_DOCUMENTS_READ','TIERS_DOCUMENTS_WRITE','TIERS_DOCUMENTS_DELETE',
    'TIERS_AGREMENT_STATUER',
    'ADMIN_REFERENTIEL_TIERS_READ','ADMIN_REFERENTIEL_TIERS_WRITE','ADMIN_REFERENTIEL_TIERS_DELETE'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- assistant_travaux : périmètre opérationnel
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'assistant_travaux'), p.id
FROM permissions p
WHERE p.code IN (
  'TIERS_FOURNISSEURS_READ',
  'TIERS_SOUSTRAITANTS_READ','TIERS_SOUSTRAITANTS_WRITE',
  'TIERS_DOCUMENTS_READ','TIERS_DOCUMENTS_WRITE','TIERS_DOCUMENTS_DELETE',
  'TIERS_AGREMENT_STATUER',
  'ADMIN_REFERENTIEL_TIERS_READ',
  'CHANTIERS_READ',
  'COMMERCIAL_CLIENTS_READ',
  'COMMERCIAL_DEVIS_READ'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- acheteur : accès complet aux documents + lecture référentiel
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'acheteur'), p.id
FROM permissions p
WHERE p.code IN (
  'TIERS_DOCUMENTS_READ','TIERS_DOCUMENTS_WRITE',
  'TIERS_AGREMENT_STATUER',
  'ADMIN_REFERENTIEL_TIERS_READ'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- conducteur_travaux : lecture documents/agrément (visibilité sur ses tiers)
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'conducteur_travaux'), p.id
FROM permissions p
WHERE p.code IN (
  'TIERS_DOCUMENTS_READ',
  'ADMIN_REFERENTIEL_TIERS_READ'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- lecture_seule : *_READ uniquement
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'lecture_seule'), p.id
FROM permissions p
WHERE p.code IN ('TIERS_DOCUMENTS_READ','ADMIN_REFERENTIEL_TIERS_READ')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
