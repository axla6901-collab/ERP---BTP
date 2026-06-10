-- 0021_rbac_granulaire.sql
-- RBAC granulaire : rôles + permissions atomiques + matrice rôle×permission.
-- Bascule utilisateurs.role (enum 8 valeurs) → role_id FK (référence roles.id).
--
-- Convention codes :
--   - roles.code     en MAJUSCULES_SNAKE (ADMIN, CONDUCTEUR_TRAVAUX, ...)
--   - permissions.code = MODULE_SOUSMODULE_ACTION en MAJUSCULES_SNAKE
--
-- Les rôles système (systeme=true) ne sont pas supprimables (garde-fou applicatif)
-- mais leurs permissions sont éditables via la matrice.

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────────────────────

CREATE TABLE roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  libelle       TEXT NOT NULL,
  description   TEXT,
  systeme       BOOLEAN NOT NULL DEFAULT false,
  actif         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TABLE permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  libelle       TEXT NOT NULL,
  description   TEXT,
  module        TEXT NOT NULL,
  sous_module   TEXT,
  ordre         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_permissions_groupe ON permissions (module, sous_module, ordre);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by    TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL,
  PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_permission ON role_permissions (permission_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Seed des rôles système
-- ─────────────────────────────────────────────────────────────

-- Codes en snake_case lowercase (compat avec lib/<module>/permissions.ts).
INSERT INTO roles (code, libelle, description, systeme, actif) VALUES
  ('admin',               'Administrateur',         'Accès complet à toutes les fonctions + gestion des droits et utilisateurs.',           true, true),
  ('conducteur_travaux',  'Conducteur de travaux',  'Pilotage des chantiers, devis, planning, achats.',                                      true, true),
  ('chef_chantier',       'Chef de chantier',       'Pilotage opérationnel terrain : pointages, avancement, suivi chantier.',                true, true),
  ('comptable',           'Comptable',              'Facturation, export comptable, suivi financier.',                                       true, true),
  ('acheteur',            'Acheteur',               'Catalogue, fournisseurs, grilles tarifaires.',                                          true, true),
  ('rh',                  'RH',                     'Dossiers employés, documents RH, contrats, validation des pointages.',                  true, true),
  ('ouvrier',             'Ouvrier',                'Saisie de pointage uniquement (accès terrain).',                                        true, true),
  ('lecture_seule',       'Lecture seule',          'Consultation uniquement (auditeur, expert-comptable externe).',                         true, true);

-- ─────────────────────────────────────────────────────────────
-- 3. Seed des permissions atomiques
-- ─────────────────────────────────────────────────────────────

INSERT INTO permissions (code, libelle, description, module, sous_module, ordre) VALUES
  -- Catalogue
  ('CATALOGUE_FAMILLES_READ',     'Consulter les familles',         'Voir l''arborescence des familles d''articles.',                          'Catalogue',    'Familles',       10),
  ('CATALOGUE_FAMILLES_WRITE',    'Créer/modifier une famille',     'Ajouter ou modifier une famille d''articles.',                            'Catalogue',    'Familles',       20),
  ('CATALOGUE_FAMILLES_DELETE',   'Supprimer une famille',          'Marquer une famille comme supprimée.',                                    'Catalogue',    'Familles',       30),
  ('CATALOGUE_ARTICLES_READ',     'Consulter les articles',         'Voir les articles, prix et compositions.',                                'Catalogue',    'Articles',       40),
  ('CATALOGUE_ARTICLES_WRITE',    'Créer/modifier un article',      'Ajouter ou modifier un article et sa composition.',                       'Catalogue',    'Articles',       50),
  ('CATALOGUE_ARTICLES_DELETE',   'Supprimer un article',           'Marquer un article comme supprimé.',                                      'Catalogue',    'Articles',       60),
  ('CATALOGUE_UNITES_READ',       'Consulter les unités',           'Voir le référentiel des unités.',                                         'Catalogue',    'Unités',         70),
  ('CATALOGUE_UNITES_WRITE',      'Créer/modifier une unité',       'Ajouter ou modifier une unité.',                                          'Catalogue',    'Unités',         80),
  ('CATALOGUE_UNITES_DELETE',     'Supprimer une unité',            'Marquer une unité comme supprimée.',                                      'Catalogue',    'Unités',         90),

  -- Tiers
  ('TIERS_FOURNISSEURS_READ',     'Consulter les fournisseurs',     'Voir les fournisseurs et grilles tarifaires.',                            'Tiers',        'Fournisseurs',  100),
  ('TIERS_FOURNISSEURS_WRITE',    'Créer/modifier un fournisseur',  'Gérer un fournisseur et ses grilles tarifaires.',                         'Tiers',        'Fournisseurs',  110),
  ('TIERS_FOURNISSEURS_DELETE',   'Supprimer un fournisseur',       'Marquer un fournisseur comme supprimé.',                                  'Tiers',        'Fournisseurs',  120),
  ('TIERS_SOUSTRAITANTS_READ',    'Consulter les sous-traitants',   'Voir les sous-traitants et leurs documents administratifs.',              'Tiers',        'Sous-traitants',130),
  ('TIERS_SOUSTRAITANTS_WRITE',   'Créer/modifier un sous-traitant','Gérer un sous-traitant et ses documents administratifs.',                 'Tiers',        'Sous-traitants',140),
  ('TIERS_SOUSTRAITANTS_DELETE',  'Supprimer un sous-traitant',     'Marquer un sous-traitant comme supprimé.',                                'Tiers',        'Sous-traitants',150),

  -- Commercial
  ('COMMERCIAL_CLIENTS_READ',     'Consulter les clients',          'Voir les clients.',                                                       'Commercial',   'Clients',       160),
  ('COMMERCIAL_CLIENTS_WRITE',    'Créer/modifier un client',       'Gérer un client.',                                                        'Commercial',   'Clients',       170),
  ('COMMERCIAL_CLIENTS_DELETE',   'Supprimer un client',            'Marquer un client comme supprimé.',                                       'Commercial',   'Clients',       180),
  ('COMMERCIAL_DEVIS_READ',       'Consulter les devis',            'Voir les devis et leurs lignes.',                                         'Commercial',   'Devis',         190),
  ('COMMERCIAL_DEVIS_WRITE',      'Créer/modifier un devis',        'Créer ou éditer un devis (brouillon).',                                   'Commercial',   'Devis',         200),
  ('COMMERCIAL_DEVIS_SUBMIT',     'Soumettre un devis',             'Envoyer un devis pour validation.',                                       'Commercial',   'Devis',         210),
  ('COMMERCIAL_DEVIS_VALIDATE',   'Valider/refuser un devis',       'Approuver ou refuser un devis soumis.',                                   'Commercial',   'Devis',         220),
  ('COMMERCIAL_DEVIS_DELETE',     'Supprimer un devis',             'Supprimer un devis brouillon.',                                           'Commercial',   'Devis',         230),

  -- Chantiers
  ('CHANTIERS_READ',              'Consulter les chantiers',        'Voir les chantiers et tâches.',                                           'Chantiers',    NULL,            240),
  ('CHANTIERS_WRITE',             'Créer/modifier un chantier',     'Créer ou éditer un chantier et ses tâches.',                              'Chantiers',    NULL,            250),
  ('CHANTIERS_DELETE',            'Supprimer un chantier',          'Marquer un chantier comme supprimé.',                                     'Chantiers',    NULL,            260),

  -- RH
  ('RH_EMPLOYES_READ',            'Consulter les employés',         'Voir les dossiers employés.',                                             'RH',           'Employés',      270),
  ('RH_EMPLOYES_WRITE',           'Créer/modifier un employé',      'Gérer un dossier employé.',                                               'RH',           'Employés',      280),
  ('RH_EMPLOYES_DELETE',          'Supprimer un employé',           'Marquer un dossier employé comme supprimé.',                              'RH',           'Employés',      290),
  ('RH_POINTAGES_READ',           'Consulter les pointages',        'Voir les pointages individuels et la matrice.',                           'RH',           'Pointages',     300),
  ('RH_POINTAGES_WRITE',          'Saisir un pointage',             'Créer ou éditer un pointage.',                                            'RH',           'Pointages',     310),
  ('RH_POINTAGES_VALIDATE',       'Valider les pointages',          'Valider les pointages avant export paie.',                                'RH',           'Pointages',     320),
  ('RH_IMPORT',                   'Importer des données RH',        'Lancer un import de pointages ou de fiches employés.',                    'RH',           'Import',        330),

  -- Facturation
  ('FACTURATION_FACTURES_READ',   'Consulter les factures',         'Voir les factures émises.',                                               'Facturation',  'Factures',      340),
  ('FACTURATION_FACTURES_WRITE',  'Créer/modifier une facture',     'Créer ou éditer une facture.',                                            'Facturation',  'Factures',      350),
  ('FACTURATION_SITUATIONS_READ', 'Consulter les situations',       'Voir les situations de travaux.',                                         'Facturation',  'Situations',    360),
  ('FACTURATION_SITUATIONS_WRITE','Créer/modifier une situation',   'Créer ou éditer une situation de travaux.',                               'Facturation',  'Situations',    370),

  -- Administration
  ('ADMIN_UTILISATEURS_READ',     'Consulter les utilisateurs',     'Voir la liste des utilisateurs et leur rôle.',                            'Administration', 'Utilisateurs', 380),
  ('ADMIN_UTILISATEURS_WRITE',    'Gérer les utilisateurs',         'Créer, modifier ou désactiver un utilisateur, assigner un rôle.',         'Administration', 'Utilisateurs', 390),
  ('ADMIN_ROLES_READ',            'Consulter les rôles',            'Voir les rôles et la matrice de permissions.',                            'Administration', 'Rôles',        400),
  ('ADMIN_ROLES_WRITE',           'Gérer les rôles & permissions',  'Créer, modifier, dupliquer un rôle ; cocher/décocher la matrice.',        'Administration', 'Rôles',        410),
  ('ADMIN_MCD_READ',              'Consulter le MCD',               'Visualiser le Modèle Conceptuel de Données.',                             'Administration', 'MCD',          420);

-- ─────────────────────────────────────────────────────────────
-- 4. Matrice rôle × permission (équivalent des helpers `peut*` actuels)
-- ─────────────────────────────────────────────────────────────

-- admin : toutes les permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin';

-- conducteur_travaux
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'conducteur_travaux'), p.id
FROM permissions p WHERE p.code IN (
  'CATALOGUE_FAMILLES_READ','CATALOGUE_FAMILLES_WRITE',
  'CATALOGUE_ARTICLES_READ','CATALOGUE_ARTICLES_WRITE',
  'CATALOGUE_UNITES_READ',
  'TIERS_FOURNISSEURS_READ','TIERS_SOUSTRAITANTS_READ',
  'COMMERCIAL_CLIENTS_READ','COMMERCIAL_CLIENTS_WRITE',
  'COMMERCIAL_DEVIS_READ','COMMERCIAL_DEVIS_WRITE','COMMERCIAL_DEVIS_SUBMIT','COMMERCIAL_DEVIS_VALIDATE',
  'CHANTIERS_READ','CHANTIERS_WRITE',
  'RH_EMPLOYES_READ','RH_POINTAGES_READ','RH_POINTAGES_WRITE',
  'FACTURATION_FACTURES_READ','FACTURATION_SITUATIONS_READ'
);

-- chef_chantier
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'chef_chantier'), p.id
FROM permissions p WHERE p.code IN (
  'CATALOGUE_FAMILLES_READ','CATALOGUE_ARTICLES_READ','CATALOGUE_UNITES_READ',
  'TIERS_FOURNISSEURS_READ','TIERS_SOUSTRAITANTS_READ',
  'COMMERCIAL_CLIENTS_READ','COMMERCIAL_DEVIS_READ',
  'CHANTIERS_READ','CHANTIERS_WRITE',
  'RH_EMPLOYES_READ','RH_POINTAGES_READ','RH_POINTAGES_WRITE'
);

-- comptable
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'comptable'), p.id
FROM permissions p WHERE p.code IN (
  'CATALOGUE_FAMILLES_READ','CATALOGUE_ARTICLES_READ','CATALOGUE_UNITES_READ',
  'TIERS_FOURNISSEURS_READ','TIERS_SOUSTRAITANTS_READ',
  'COMMERCIAL_CLIENTS_READ','COMMERCIAL_CLIENTS_WRITE',
  'COMMERCIAL_DEVIS_READ','COMMERCIAL_DEVIS_WRITE','COMMERCIAL_DEVIS_VALIDATE',
  'CHANTIERS_READ',
  'RH_EMPLOYES_READ','RH_POINTAGES_READ',
  'FACTURATION_FACTURES_READ','FACTURATION_FACTURES_WRITE',
  'FACTURATION_SITUATIONS_READ','FACTURATION_SITUATIONS_WRITE'
);

-- acheteur
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'acheteur'), p.id
FROM permissions p WHERE p.code IN (
  'CATALOGUE_FAMILLES_READ','CATALOGUE_FAMILLES_WRITE',
  'CATALOGUE_ARTICLES_READ','CATALOGUE_ARTICLES_WRITE',
  'CATALOGUE_UNITES_READ','CATALOGUE_UNITES_WRITE',
  'TIERS_FOURNISSEURS_READ','TIERS_FOURNISSEURS_WRITE','TIERS_FOURNISSEURS_DELETE',
  'TIERS_SOUSTRAITANTS_READ','TIERS_SOUSTRAITANTS_WRITE',
  'COMMERCIAL_CLIENTS_READ','COMMERCIAL_DEVIS_READ',
  'CHANTIERS_READ'
);

-- rh
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'rh'), p.id
FROM permissions p WHERE p.code IN (
  'CATALOGUE_FAMILLES_READ','CATALOGUE_ARTICLES_READ','CATALOGUE_UNITES_READ',
  'TIERS_FOURNISSEURS_READ','TIERS_SOUSTRAITANTS_READ',
  'COMMERCIAL_CLIENTS_READ','CHANTIERS_READ',
  'RH_EMPLOYES_READ','RH_EMPLOYES_WRITE','RH_EMPLOYES_DELETE',
  'RH_POINTAGES_READ','RH_POINTAGES_WRITE','RH_POINTAGES_VALIDATE',
  'RH_IMPORT'
);

-- ouvrier
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'ouvrier'), p.id
FROM permissions p WHERE p.code IN (
  'CHANTIERS_READ',
  'RH_POINTAGES_WRITE'
);

-- lecture_seule : toutes les permissions *_READ
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'lecture_seule'), p.id
FROM permissions p WHERE p.code LIKE '%_READ';

-- ─────────────────────────────────────────────────────────────
-- 5. Bascule utilisateurs.role (enum) → role_id (FK)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE utilisateurs ADD COLUMN role_id UUID REFERENCES roles(id) ON DELETE RESTRICT;

UPDATE utilisateurs SET role_id = (
  SELECT r.id FROM roles r WHERE r.code = utilisateurs.role::text
);

ALTER TABLE utilisateurs ALTER COLUMN role_id SET NOT NULL;
ALTER TABLE utilisateurs DROP COLUMN role;
DROP TYPE role_utilisateur;

CREATE INDEX idx_utilisateurs_role ON utilisateurs (role_id);

-- ─────────────────────────────────────────────────────────────
-- 6. Grants
-- ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON roles, permissions, role_permissions TO app_rw;

COMMIT;
