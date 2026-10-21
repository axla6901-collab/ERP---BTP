# Module « Test SIRH »

SIRH complet construit **nativement** dans l'ERP, d'après le périmètre fonctionnel de
l'API Factorial (<https://apidoc.factorialhr.com>, version `2026-10-01`). Aucune
dépendance au SaaS Factorial : seul le modèle fonctionnel est repris (règle
d'autonomie du projet). Les collaborateurs restent ceux de la table `employes`
(module RH) ; le SIRH y rattache ses propres données.

## Activation

Option par entreprise, comme Planning ou Flotte :
**Administration › Ma société › Modules optionnels › Module Test SIRH**
(admin tenant). La colonne est `entreprises.test_sirh_active`.

La **première activation** crée les référentiels par défaut, uniquement dans les tables
encore vides (`lib/test-sirh/amorcage.ts`) :

- 12 types d'absence (CP en jours ouvrables, RTT, repos compensateur, maladie, AT,
  maternité, paternité, événements familiaux, formation, **intempéries BTP**,
  sans solde, absence injustifiée) ;
- 2 horaires (35 h, 39 h BTP) ;
- 8 dossiers GED ;
- les jours fériés de l'année en cours et de la suivante ;
- 2 modèles de processus (intégration d'un compagnon BTP : DPAE, carte BTP,
  EPI, accueil sécurité… ; départ) ;
- 7 formations réglementaires (SST, CACES R482/R486/R489, AIPR, habilitation
  électrique, travail en hauteur).

## Migrations à appliquer (base locale)

`pnpm db:migrate` ne fonctionne pas sur ce projet (journal Drizzle vide). Il faut
appliquer les fichiers dans l'ordre, en `app_migrator` :

```bash
for f in 0078_test_sirh_module 0079_test_sirh_flag 0080_test_sirh_permissions; do
  docker exec -i -e PGPASSWORD=app_migrator_dev_password erp-btp-postgres \
    psql -v ON_ERROR_STOP=1 -U app_migrator -d erpbtp < "db/migrations/$f.sql"
done
```

Les trois migrations sont idempotentes (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

| Migration                        | Contenu                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0078_test_sirh_module.sql`      | 37 enums, 37 tables `sirh_*`, index, contraintes, triggers `updated_at`, héritage `entreprise_id` (0044), RLS `p_tenant` (FORCE) + GRANT `app_rw` |
| `0079_test_sirh_flag.sql`        | `entreprises.test_sirh_active`                                                                                                                    |
| `0080_test_sirh_permissions.sql` | Permissions `SIRH_READ`, `SIRH_WRITE`, `SIRH_VALIDATION`, `SIRH_PAIE`, `SIRH_LIBRE_SERVICE` (ordres 600-616) et affectations par défaut           |

## Correspondance Factorial → Test SIRH

| Namespace Factorial                                     | Tables                                                                                                                              | Écrans                                                 |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `locations`, `teams`, `job_catalog`                     | `sirh_sites`, `sirh_equipes`, `sirh_equipe_membres`, `sirh_postes`                                                                  | Organisation                                           |
| `employees`, `employee_updates`                         | `sirh_collaborateurs` (+ `employes`)                                                                                                | Collaborateurs, registre du personnel                  |
| `contracts`                                             | `sirh_contrats` (salaires chiffrés AES-256-GCM)                                                                                     | Dossier collaborateur › Contrats                       |
| `timeoff`, `holidays`                                   | `sirh_types_absence`, `sirh_compteurs`, `sirh_compteur_ajustements`, `sirh_absences`, `sirh_periodes_bloquees`, `sirh_jours_feries` | Absences (demandes, calendrier, compteurs, paramètres) |
| `work_schedule`, `attendance`                           | `sirh_horaires`, `sirh_badgeages`, `sirh_heures_sup`                                                                                | Temps de travail                                       |
| `payroll`, `compensations`, `payroll_integrations_base` | `sirh_periodes_paie`, `sirh_variables_paie`                                                                                         | Paie                                                   |
| `expenses` (Expense, Mileage, PerDiem)                  | `sirh_notes_frais`                                                                                                                  | Notes de frais                                         |
| `documents`                                             | `sirh_dossiers_documents`, `sirh_documents` (MinIO)                                                                                 | Documents                                              |
| `ats`                                                   | `sirh_offres`, `sirh_candidats`, `sirh_candidatures`, `sirh_candidature_avis`                                                       | Recrutement                                            |
| `performance`                                           | `sirh_campagnes_entretiens`, `sirh_entretiens`, `sirh_objectifs`                                                                    | Entretiens                                             |
| `trainings`                                             | `sirh_formations`, `sirh_sessions_formation`, `sirh_inscriptions_formation`                                                         | Formation                                              |
| `processes`, `tasks`                                    | `sirh_modeles_processus`, `sirh_modele_taches`, `sirh_processus`, `sirh_taches`                                                     | Onboarding & tâches                                    |
| `it_management` (étendu EPI/outillage)                  | `sirh_materiels`, `sirh_attributions_materiel`                                                                                      | Matériel & EPI                                         |
| `posts`                                                 | `sirh_annonces`                                                                                                                     | Annonces                                               |
| `approvals`                                             | — (workflow intégré à chaque demande)                                                                                               | Validations                                            |

**Namespaces écartés volontairement** : `finance`, `procurement`, `banking`,
`project_management`, `bookkeepers_management`, `marketplace`, `integrations`,
`api_public`, `custom_fields` et `custom_resources`. Ils sortent du périmètre RH ou
sont déjà couverts par d'autres modules de l'ERP (chantiers, facturation, achats).

## Droits

| Capacité                                      | Rôles par défaut                                                           | Code                                        |
| --------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------- |
| Consulter les écrans de gestion               | admin, rh, comptable, conducteur_travaux, chef_chantier, assistant_travaux | `SIRH_READ` / `ROLES_SIRH_LECTURE`          |
| Gérer les données RH                          | admin, rh                                                                  | `SIRH_WRITE` / `ROLES_SIRH_GESTION`         |
| Valider absences, heures sup., notes de frais | admin, rh, conducteur_travaux, chef_chantier                               | `SIRH_VALIDATION` / `ROLES_SIRH_VALIDATION` |
| Paie et rémunérations                         | admin, rh, comptable                                                       | `SIRH_PAIE` / `ROLES_SIRH_PAIE`             |
| Espace salarié (sa propre fiche)              | tous les rôles                                                             | `SIRH_LIBRE_SERVICE`                        |

L'espace salarié suppose que le compte utilisateur soit rattaché à une fiche employé
(`employes.utilisateur_id`). Le rattachement se fait depuis le dossier collaborateur.

## Architecture du code

- `db/schema/test-sirh.ts` : schéma Drizzle (miroir de 0078, vérifié par
  `tests/unit/lib/validation/test-sirh/enums.test.ts`).
- `lib/test-sirh/` : socle (`contexte`, `permissions`, `acces`, `referentiels`,
  `calendrier`, `format`, `csv`, `erreurs`, `stockage`, `activation`, `amorcage`), puis un
  dossier par domaine (actions `'use server'` + `queries.ts` `server-only` + logique pure).
- `lib/validation/test-sirh/` : `enums.ts` (listes et libellés FR), `commun.ts` (helpers
  zod), un schéma par domaine.
- `components/test-sirh/` : composants partagés, puis un dossier par domaine.
- `app/(app)/[entrepriseSlug]/test-sirh/` : pages.

## Écrans (38 pages sous `/<slug>/test-sirh`)

| Rubrique         | Routes                                                                       | Contenu                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tableau de bord  | `/`                                                                          | KPI de tous les domaines, contrats à surveiller, recyclages, entretiens professionnels en retard, absents du jour, annonces                                                                                                              |
| Mon espace       | `/mon-espace`                                                                | Libre-service : compteurs, demandes d'absence, semaine badgée, heures sup., notes de frais, tâches, entretiens (commentaire salarié), formations, matériel, documents à signer                                                           |
| Validations      | `/validations`                                                               | Boîte unique : absences, heures sup., notes de frais                                                                                                                                                                                     |
| Collaborateurs   | `/collaborateurs`, `/[employeId]`, `/registre`                               | Liste + KPI ; dossier complet (affectation, compte utilisateur, contrats versionnés, équipes, absences, temps, frais, entretiens, formations, onboarding, matériel, documents, origine recrutement) ; registre unique du personnel (CSV) |
| Organisation     | `/organisation`, `/equipes`, `/postes`                                       | Sites, équipes et membres, catalogue des postes                                                                                                                                                                                          |
| Absences         | `/absences`, `/calendrier`, `/compteurs`, `/parametres`                      | Demandes et workflow, planning mensuel d'équipe, compteurs et ajustements, types / jours fériés / périodes bloquées                                                                                                                      |
| Temps de travail | `/temps`, `/heures-sup`, `/horaires`                                         | Feuille de temps hebdomadaire et validation, heures sup., horaires                                                                                                                                                                       |
| Paie             | `/paie`, `/[periodeId]`                                                      | Périodes, variables, import idempotent des éléments validés, synthèse, export CSV                                                                                                                                                        |
| Notes de frais   | `/notes-frais`                                                               | Dépenses, IK (barème URSSAF 2025), forfaits, justificatifs, workflow jusqu'au remboursement                                                                                                                                              |
| Recrutement      | `/recrutement`, `/offres/[offreId]`, `/candidats`, `/candidats/[candidatId]` | Offres, pipeline, avis, embauche (crée la fiche employé + dossier SIRH + 1er contrat), vivier et RGPD                                                                                                                                    |
| Entretiens       | `/entretiens`, `/liste`, `/[entretienId]`, `/suivi`                          | Campagnes, comptes rendus, objectifs, suivi légal L6315-1                                                                                                                                                                                |
| Formation        | `/formation`, `/sessions`, `/sessions/[sessionId]`, `/habilitations`         | Catalogue, sessions et présence, validité et recyclages                                                                                                                                                                                  |
| Onboarding       | `/onboarding`, `/[processusId]`, `/taches`, `/modeles`                       | Processus d'arrivée et de départ, tâches, modèles                                                                                                                                                                                        |
| Matériel & EPI   | `/materiel`                                                                  | Inventaire, attributions, restitutions, contrôles                                                                                                                                                                                        |
| Documents        | `/documents`                                                                 | GED par dossiers, documents salariés et d'entreprise, signature                                                                                                                                                                          |
| Annonces         | `/annonces`                                                                  | Fil d'actualité filtré par site / équipe                                                                                                                                                                                                 |

## Vérifications effectuées

- Tests unitaires : 1926 tests (235 fichiers) sur tout le projet, dont plus de 900 pour le module.
- `tsc --noEmit`, `eslint .` et `prettier --check .` propres.
- Contrôle statique des frontières Next.js : aucun export non asynchrone dans un fichier
  `'use server'`, aucun composant client qui importe un module `server-only`.
- Migrations 0078-0080 exécutées deux fois sur un Postgres embarqué (PGlite) :
  structure, RLS sous `app_rw`, triggers, contraintes et index uniques vérifiés.

## Limites connues

- Les server actions et les pages n'ont pas tourné contre la base réelle : à recetter
  après application des migrations.
- `employes` reste la fiche d'identité du module RH : terminer un contrat SIRH ne met
  pas à jour `employes.date_sortie` / `actif`.
- Registre du personnel : pas de mention du titre de travail des salariés étrangers
  (donnée absente du schéma).
- Types d'absence livrés sans code rubrique de paie : à renseigner avant le premier
  export vers le logiciel de paie.
- Entretiens professionnels : les entretiens dus au retour de certaines absences
  (maternité, congé parental, longue maladie…) ne sont pas générés automatiquement.
