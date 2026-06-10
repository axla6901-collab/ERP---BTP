# Correspondance MCD → Base de données

Ce document mappe les entités du MCD de référence (`MCD_ERP_Batiment.pdf` v1.0) vers les tables Postgres effectivement implémentées, en intégrant les décisions des ADR.

> **Architecture multi-tenant active** (migrations 0037 → 0044) — voir section ["Multi-tenant"](#multi-tenant) ci-dessous.

---

## MCD interactif (`/admin/mcd`, super-admin)

Le diagramme `/admin/mcd` n'est **pas** maintenu à la main : il est **introspecté à la volée** depuis le schéma Drizzle ([lib/admin/mcd-introspect.ts](../lib/admin/mcd-introspect.ts)). Toute table ajoutée à un fichier `db/schema/<module>.ts` déjà enregistré apparaît donc automatiquement (entités, colonnes, PK, FK, cardinalités).

Le regroupement visuel par couleur est décrit dans [lib/admin/mcd-modules.ts](../lib/admin/mcd-modules.ts) :

- `MCD_MODULES` — label + couleurs de chaque module ;
- `MCD_MODULE_ORDER` — ordre d'affichage / de tri ;
- `SCHEMAS_PAR_MODULE` (dans `mcd-introspect.ts`) — fichier `db/schema/` de chaque module ;
- `TABLE_MODULE_OVERRIDES` — rattachement explicite d'une table à un module, prioritaire sur son fichier (modules « virtuels » sans fichier propre, ex. **Planning** dont les tables vivent dans `chantiers.ts`).

### Ajouter un module au MCD

1. **Module avec son propre fichier** `db/schema/<id>.ts` :
   - ajouter `<id>` à `McdModuleId`, `MCD_MODULES` (label + couleur), `MCD_MODULE_ORDER` ;
   - importer le fichier et l'ajouter à `SCHEMAS_PAR_MODULE`.
2. **Module « virtuel »** (tables hébergées dans le fichier d'un autre domaine, ex. Planning) :
   - étapes du point 1 **sauf** `SCHEMAS_PAR_MODULE` ;
   - rattacher chaque table concernée via `TABLE_MODULE_OVERRIDES` (`'<table>': '<id>'`).

> **Garde-fou** : [tests/unit/lib/admin/mcd-introspect.test.ts](../tests/unit/lib/admin/mcd-introspect.test.ts) échoue (CI) tant qu'une table du schéma n'est rattachée à aucun module, ou qu'un override pointe vers une table/un module inexistant. C'est ce test qui empêche qu'un nouveau module reste invisible — comme l'était le Planning.

---

## Conventions

- Noms de tables en **snake_case pluriel** : `chantiers`, `devis`, `ouvrages`, `factures`.
- Clés primaires : `id UUID DEFAULT gen_random_uuid()`.
- Toutes les tables métier portent :
  - `entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE RESTRICT` (multi-tenant)
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` (trigger `BEFORE UPDATE`)
  - `created_by UUID REFERENCES utilisateurs(id)`
  - `updated_by UUID REFERENCES utilisateurs(id)`
  - `deleted_at TIMESTAMPTZ NULL` (soft delete)
- **Monétaire** : `NUMERIC(14,2)`.
- **Taux / pourcentages** : `NUMERIC(5,2)`.
- **FK** : suffixées `_id`, `ON DELETE RESTRICT` par défaut, `CASCADE` uniquement pour les lignes filles d'en-tête (`lignes_devis` vs. `devis`).
- **Index** : systématique sur toutes les FK, plus les colonnes fréquemment filtrées (`statut`, `date_validite`, etc.). Tous les `entreprise_id` ont un index dédié.
- **Codes/numéros métier** : scopés par tenant (`UNIQUE (entreprise_id, code)` ou `UNIQUE (entreprise_id, numero)`).

---

## Tables par domaine

### Multi-tenant (migrations 0037-0044)

| Table                     | Rôle                                                                                                                                                                                                                                                                                    | Origine          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `entreprises`             | **Racine du multi-tenant**. Une ligne = une société cliente. `slug TEXT UNIQUE` utilisé dans l'URL (`/[entrepriseSlug]/...`). Contient identité juridique : SIRET, TVA intracom, adresse, logo. Soft-delete via `deleted_at`.                                                           | **Ajout** (0037) |
| `utilisateur_entreprises` | Jointure many-to-many user ↔ entreprise, PK composite. Porte le **rôle de l'utilisateur DANS cette entreprise** (`role_id`), un flag `is_default` (unique partiel par user) pour le post-login auto, et soft-delete. Un user peut appartenir à N entreprises avec des rôles différents. | **Ajout** (0037) |
| `entreprise_logos`        | Logos d'une entreprise (1 principal + N certifications type RGE/Qualibat). Binaire en MinIO (`storage_key`), métadonnées en DB.                                                                                                                                                         | **Ajout** (0045) |
| `entreprise_conditions`   | CGV / CGA versionnées par entreprise. Chaque enregistrement = une version juridique (date d'effet). Contenu HTML (rendu Tiptap) + JSON (ré-édition).                                                                                                                                    | **Ajout** (0045) |

### Socle applicatif (ajouté vs. MCD — voir ADR-002)

| Table                                                      | Rôle                                                                                                                                                                                                                          | Origine                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `user`, `session`, `account`, `verification`, `two_factor` | Tables gérées par Better Auth (cf. [ADR-006](adr/006-stack-autonome.md)). **Globales** (multi-tenant côté app, pas DB).                                                                                                       | **Ajout** (lib)            |
| `utilisateurs`                                             | Compte applicatif (état, lien optionnel vers employé). FK 1-1 vers `user(id)`. Flag `is_super_admin` ajouté en 0037 pour la console de provisioning. **Global** (rattachement aux entreprises via `utilisateur_entreprises`). | **Ajout** (ADR-002)        |
| `roles`                                                    | Rôles applicatifs administrables. Flag `systeme` pour rôles seedés non supprimables. **Global** (matrice partagée entre toutes les entreprises). Rôle système `super_admin` ajouté en 0037.                                   | **Ajout** (migration 0021) |
| `permissions`                                              | Permissions atomiques (code `MODULE_SOUSMODULE_ACTION`), groupées par `module` / `sous_module`. **Global**.                                                                                                                   | **Ajout** (migration 0021) |
| `role_permissions`                                         | Matrice rôle × permission (PK composite). **Globale**.                                                                                                                                                                        | **Ajout** (migration 0021) |
| `employes`                                                 | Données RH (MCD EMPLOYE). **Scopée par tenant**.                                                                                                                                                                              | MCD                        |
| `audit_log`                                                | Traçabilité technique (qui, quand, avant/après JSONB). `entreprise_id` **NULLABLE** : actions super-admin cross-tenant tracées sans rattachement.                                                                             | **Ajout**                  |
| `numeros_attribues`                                        | Registre annuel des numéros attribués. **Séquence per-entreprise** depuis 0043.                                                                                                                                               | **Ajout** (ADR-003)        |

#### Modèle RBAC granulaire (migration 0021)

```
roles (1)─────┐
              │
              ▼
        role_permissions ◀────(N)──── permissions
              ▲
              │
utilisateurs (N)─── role_id FK ──▶ roles
```

- `roles.systeme = true` : rôle seedé par la migration (admin, conducteur_travaux, chef_chantier, comptable, acheteur, rh, ouvrier, lecture_seule). Non supprimable, mais matrice éditable.
- `roles.actif` : permet de désactiver un rôle custom sans le supprimer (les utilisateurs encore rattachés gardent leur ligne mais perdent l'accès).
- `permissions.code` est l'identifiant stable utilisé en code (futur : `peut(role, 'CATALOGUE_ARTICLES_WRITE')`).
- L'admin de la matrice se fait dans `/administration/roles` (cf. ROADMAP — L2 introduit l'édition par cases à cocher, L3 la gestion des utilisateurs).
- Le rattachement `utilisateurs.role_id` est `ON DELETE RESTRICT` : impossible de supprimer un rôle encore assigné.

### Bibliothèque de prix

| Table                  | Entité MCD          | Notes d'implémentation                                                                                                                        |
| ---------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `familles_ouvrage`     | FAMILLE_OUVRAGE     | `code UNIQUE NOT NULL`                                                                                                                        |
| `ouvrages`             | OUVRAGE             | `prix_unitaire_ht` calculé depuis composition (vue matérialisée `ouvrages_prix_calcules`) OU saisi manuellement (flag `prix_calcule BOOLEAN`) |
| `compositions_ouvrage` | COMPOSITION_OUVRAGE | `UNIQUE (ouvrage_id, article_id)` — un article ne peut apparaître qu'une fois par ouvrage                                                     |
| `familles_article`     | FAMILLE_ARTICLE     | `code UNIQUE NOT NULL`                                                                                                                        |
| `articles`             | ARTICLE             | `prix_unitaire_ht` = prix de référence, écrasé par `tarifs_fournisseur` si disponible                                                         |
| `tarifs_fournisseur`   | TARIF_FOURNISSEUR   | `CHECK (date_fin IS NULL OR date_fin >= date_debut)` ; index sur `(article_id, date_debut DESC)` ; `date_fin NULL` = tarif en cours           |

### Commercial

| Table          | Entité MCD  | Notes                                                                                                                                                                          |
| -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clients`      | CLIENT      | `siret` UNIQUE NULL (particuliers sans SIRET autorisés) ; validation format SIRET via Zod                                                                                      |
| `devis`        | DEVIS       | `numero UNIQUE` (format ADR-003 : `D-2026-000042`) ; `chantier_id` **NULLABLE** (devis peut exister avant chantier)                                                            |
| `lignes_devis` | LIGNE_DEVIS | **CHECK XOR** entre `ouvrage_id` et `article_id` selon discriminateur `type`                                                                                                   |
| `factures`     | FACTURE     | **Ajout** : `taux_tva NUMERIC(5,2) NOT NULL` (absent du MCD mais nécessaire). `situation_id` UNIQUE NULL (facture directe possible hors situation). Champs Factur-X pré-câblés |

### Chantier & planification

| Table                | Entité MCD        | Notes                                                                                                                                                |
| -------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chantiers`          | CHANTIER          | `responsable_id` → `employes(id)` (ADR-002). Index sur `statut`                                                                                      |
| `taches`             | TACHE             | `avancement CHECK (avancement BETWEEN 0 AND 100)`                                                                                                    |
| `situations_travaux` | SITUATION_TRAVAUX | **`UNIQUE (chantier_id, numero_situation)`** — ADR-003. Numérotation 1, 2, 3… par chantier                                                           |
| `documents`          | DOCUMENT          | Fichier physique dans bucket MinIO `erp-btp-documents` (S3-compatible, cf. [ADR-006](adr/006-stack-autonome.md)). Champ `hash_sha256` pour intégrité |

### Planning (Gantt) — migration 0053

| Table                   | Entité MCD | Notes                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chantier_taches`       | TACHE      | **Étendue** par le module Planning (`niveau`, `corps_metier`, `heures_planifiees`, `est_jalon`, `predecesseur_id` réflexif). Reste rattachée au domaine **Chantiers** dans le MCD : elle préexiste (migration 0010) et est référencée hors planning (`pointages.tache_id`).                                      |
| `chantier_tache_equipe` | — (ajout)  | **Créée par le module Planning**. Une ligne = un ouvrier (`utilisateur_id`) affecté à une tâche, avec `heures_prevues` / `heures_faites`. Anti-doublon `UNIQUE (tache_id, utilisateur_id) WHERE deleted_at IS NULL`. Seule table **colorée « Planning »** dans le MCD interactif (cf. `TABLE_MODULE_OVERRIDES`). |

### RH & pointage

| Table       | Entité MCD | Notes                                                                                                                                         |
| ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `employes`  | EMPLOYE    | **Ajout** : `matricule TEXT UNIQUE NULL`, `date_entree DATE NOT NULL`, `date_sortie DATE NULL`                                                |
| `pointages` | POINTAGE   | `UNIQUE (employe_id, date_pointage, tache_id)` — idempotence offline. `client_uuid UUID UNIQUE NOT NULL` — idempotency key côté PWA (ADR-004) |

### Achats

| Table             | Entité MCD     | Notes                                                                       |
| ----------------- | -------------- | --------------------------------------------------------------------------- |
| `fournisseurs`    | FOURNISSEUR    | **CHECK cohérence actif/dates** (`actif=false` ↔ `date_sortie IS NOT NULL`) |
| `commandes`       | COMMANDE       | `numero UNIQUE` — ADR-003 (`C-2026-000231`)                                 |
| `lignes_commande` | LIGNE_COMMANDE |                                                                             |

### Sous-traitance

| Table            | Entité MCD    | Notes                                                                                                                          |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sous_traitants` | SOUS_TRAITANT | `parent_st_id` réflexif + **trigger anti-cycle + profondeur max 3**                                                            |
| `contrats_st`    | CONTRAT_ST    | `numero UNIQUE` (`ST-2026-000004`)                                                                                             |
| `factures_st`    | FACTURE_ST    | `numero UNIQUE` (`FST-2026-000019`). `retenue_garantie` auto-calculée depuis `contrats_st.sous_traitant.taux_retenue_garantie` |

### Documents administratifs

| Table                  | Entité MCD          | Notes                                                                                                |
| ---------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| `types_document_admin` | TYPE_DOCUMENT_ADMIN | **Seed obligatoire** : KBIS, URSSAF, DEC, RC_PRO, ATT_VIGILANCE, QUALIB, RGE                         |
| `documents_admin`      | DOCUMENT_ADMIN      | **CHECK XOR** `sous_traitant_id` ↔ `fournisseur_id`. `verifie_par_id` → `utilisateurs(id)` (ADR-002) |
| `historique_documents` | HISTORIQUE_DOCUMENT | `employe_id` du MCD **renommé `utilisateur_id`** → `utilisateurs(id)` (c'est une trace applicative)  |
| `alertes_document`     | ALERTE_DOCUMENT     | `destinataire_id` → `utilisateurs(id)` (destinataire d'une notif = compte)                           |

### Ajouts transverses

| Table                  | Rôle                                       |
| ---------------------- | ------------------------------------------ |
| `ecritures_comptables` | Pivot export compta (ADR-005)              |
| `plan_comptable`       | Configuration comptes par type d'opération |

---

## Contraintes métier implémentées en base

### LIGNE_DEVIS — XOR ouvrage / article

```sql
CHECK (
  (type = 'ouvrage' AND ouvrage_id IS NOT NULL AND article_id IS NULL) OR
  (type = 'article' AND article_id IS NOT NULL AND ouvrage_id IS NULL)
)
```

### DOCUMENT_ADMIN — XOR sous-traitant / fournisseur

```sql
CHECK (
  (sous_traitant_id IS NOT NULL AND fournisseur_id IS NULL) OR
  (sous_traitant_id IS NULL AND fournisseur_id IS NOT NULL)
)
```

### SOUS_TRAITANT — anti-cycle cascade

Trigger `BEFORE INSERT OR UPDATE` qui parcourt la chaîne `parent_st_id` et :

- Lève `EXCEPTION` si cycle détecté
- Lève `EXCEPTION` si profondeur > 3

### SITUATION_TRAVAUX — séquence par chantier

```sql
UNIQUE (chantier_id, numero_situation)
```

Génération via fonction `generate_numero_situation(chantier_id)` : `SELECT COALESCE(MAX(numero_situation), 0) + 1 FROM situations_travaux WHERE chantier_id = $1 FOR UPDATE`.

### FOURNISSEUR / SOUS_TRAITANT — cohérence actif / dates

```sql
CHECK (
  (actif = true AND date_sortie IS NULL) OR
  (actif = false AND date_sortie IS NOT NULL)
)
```

### POINTAGE — idempotence offline

```sql
UNIQUE (employe_id, date_pointage, tache_id),  -- métier
UNIQUE (client_uuid)                             -- technique (retry PWA)
```

---

## Seeds initiaux (M1 et M2)

### `types_document_admin`

| code            | libelle                  | periodicite_mois | alerte_avant_jours | obligatoire | categorie |
| --------------- | ------------------------ | ---------------- | ------------------ | ----------- | --------- |
| `KBIS`          | Extrait KBIS             | 3                | 15                 | true        | légal     |
| `URSSAF`        | Attestation URSSAF       | 6                | 30                 | true        | social    |
| `DEC`           | Assurance décennale      | 12               | 60                 | true        | assurance |
| `RC_PRO`        | RC professionnelle       | 12               | 30                 | true        | assurance |
| `ATT_VIGILANCE` | Attestation de vigilance | 6                | 30                 | true        | social    |
| `QUALIB`        | Qualibat                 | 48               | 90                 | false       | qualité   |
| `RGE`           | Qualification RGE        | 48               | 90                 | false       | qualité   |

### Corps de métier (référentiel)

Valeurs proposées (à ajuster avec le métier) : gros œuvre, VRD, charpente bois, charpente métallique, couverture, étanchéité, menuiseries extérieures, menuiseries intérieures, plâtrerie, cloisons sèches, isolation, peinture, revêtements sols, revêtements muraux, carrelage, plomberie, sanitaire, chauffage, climatisation, ventilation, électricité courants forts, électricité courants faibles, ascenseurs, espaces verts, serrurerie.

### Rôles applicatifs (table `roles`, seedés par migration 0021)

Les 8 rôles ci-dessous sont créés avec `systeme = true` (non supprimables). Leurs permissions par défaut sont seedées dans `role_permissions` ; elles peuvent être modifiées via `/administration/roles`.

| code                 | libelle               | MFA obligatoire | Permissions seedées (résumé)                                       |
| -------------------- | --------------------- | --------------- | ------------------------------------------------------------------ |
| `admin`              | Administrateur        | oui             | Toutes les permissions                                             |
| `conducteur_travaux` | Conducteur de travaux | non             | Catalogue/Commercial/Chantiers en écriture, RH/Facturation lecture |
| `chef_chantier`      | Chef de chantier      | non             | Chantiers écriture, pointages écriture, lecture transverse         |
| `comptable`          | Comptable             | oui             | Facturation écriture, devis lecture/écriture, lecture transverse   |
| `acheteur`           | Acheteur              | non             | Catalogue/Tiers écriture, lecture transverse                       |
| `rh`                 | RH                    | oui             | Employés/Pointages écriture, import RH, lecture transverse         |
| `ouvrier`            | Ouvrier               | non             | `RH_POINTAGES_WRITE`, `CHANTIERS_READ` uniquement                  |
| `lecture_seule`      | Lecture seule         | non             | Toutes les permissions `*_READ`                                    |

---

## Décisions d'écart par rapport au MCD

1. **Séparation `utilisateurs` vs `employes`** — MCD fusionne, on sépare (ADR-002).
2. **FACTURE.taux_tva** — ajouté (MCD n'avait que HT et TTC, incohérent).
3. **HISTORIQUE_DOCUMENT.employe_id** — renommé `utilisateur_id` (c'est une trace d'action applicative, pas de RH).
4. **ALERTE_DOCUMENT.destinataire_id** — renommé `destinataire_utilisateur_id`.
5. **CHECK XOR** ajoutés sur `lignes_devis` et `documents_admin` (MCD indique la règle en prose, on la contraint en SQL).
6. **Numéros applicatifs** : format préfixe-année-séquence (MCD dit juste "string", on formalise via ADR-003).
7. **Cascade ST** : profondeur max 3 (MCD ne limite pas, on ajoute un garde-fou légal/technique).
8. **RBAC granulaire** (migration 0021) : `utilisateurs.role` (enum 8 valeurs) remplacé par `role_id` FK + tables `roles`, `permissions`, `role_permissions`. Permet l'ajout de rôles custom + une matrice de permissions atomiques administrable via UI (`/administration/roles`).

Toutes ces décisions sont couvertes par des ADR et revues si le métier les conteste.

9. **Multi-tenant** (migrations 0037-0044) — ajout de `entreprise_id` sur **41 tables métier** + **Row Level Security PostgreSQL** + refonte `generate_numero(type, entreprise_id)`. Voir section dédiée ci-dessous.

---

## Multi-tenant

### Modèle d'isolation

L'application sert **plusieurs entreprises** avec une isolation stricte des données. Chaque utilisateur peut appartenir à plusieurs entreprises et basculer entre elles via un sélecteur en tête de sidebar.

**Décisions architecturales** (cf. plan validé) :

- Appartenance many-to-many `utilisateurs ↔ entreprises` avec rôle per-tenant et flag `is_default`.
- **Isolation au niveau base** : `entreprise_id NOT NULL` sur les tables métier + Row Level Security PostgreSQL.
- **Routing** : segment dynamique `/[entrepriseSlug]/...` (toutes les routes métier sont préfixées).
- **Provisioning super-admin** : création d'entreprises réservée aux comptes `is_super_admin = true` (console à venir Phase 5).

### Rôles DB Postgres

| Rôle                  | Privilèges                          | Usage                                                                 |
| --------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| `app_migrator` (0001) | DDL + DML, **BYPASSRLS** (owner)    | Application des migrations SQL via `docker exec psql -U app_migrator` |
| `app_rw` (0001)       | DML uniquement, **soumis à la RLS** | Pool runtime de l'app Next.js (DATABASE_URL)                          |
| `app_admin` (0037a)   | DML, **BYPASSRLS**                  | Pool super-admin pour provisioning cross-tenant (DATABASE_ADMIN_URL)  |

### Tables sous Row Level Security

Policy générique posée sur 41 tables (migration 0043) :

```sql
ALTER TABLE x ENABLE ROW LEVEL SECURITY;
ALTER TABLE x FORCE ROW LEVEL SECURITY;
CREATE POLICY p_tenant ON x TO app_rw
  USING (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid)
  WITH CHECK (entreprise_id = current_setting('app.current_entreprise_id', true)::uuid);
```

**Tables scopées (39)** : familles, articles, fournisseurs, fournisseur_contacts, nomenclatures, nomenclature_lignes, prix_articles, grilles_tarifaires, grille_tarifaire_lignes, sous_traitants, sous_traitant_contacts, clients, devis, lignes_devis, postes_internes_devis, repartitions_poste_interne, composants_ligne_devis, chantiers, chantier_taches, employes, employe_habilitations, employe_permis, employe_documents, pointages, factures, lignes_facture, situations_travaux, lignes_situation, numeros_attribues, audit_log, le module Référencement Tiers (`societes`, `tiers`, `corps_etat`, `natures_document` + leurs jonctions), et — depuis 0045 — `entreprise_logos`, `entreprise_conditions`.

**Tables NON scopées (référentiels globaux)** :

- `entreprises`, `utilisateur_entreprises` — tables transverses par nature
- `user`, `session`, `account`, `verification`, `two_factor` — Better Auth global
- `utilisateurs`, `roles`, `permissions`, `role_permissions` — RBAC système
- `unites`, `unite_conversions` — référentiel SI universel
- `nature_tiers_types_engagement` — matrice ENUM × ENUM sectorielle BTP

### Wrapper applicatif

Toutes les server actions métier passent par `withTenant` ([lib/db/with-tenant.ts](../lib/db/with-tenant.ts)) qui ouvre une transaction et pose la GUC `app.current_entreprise_id` :

```ts
export async function listerArticles() {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx.select().from(articles).where(isNull(articles.deletedAt)),
  );
}
```

**Fail-closed** : si le wrapper est omis, le GUC vaut `NULL` → la policy RLS bloque toutes les lignes (lecture vide, INSERT/UPDATE rejetés). Une règle ESLint (`no-restricted-imports`) interdit l'import direct de `db` hors de `lib/db/**`, `lib/auth/**`, `lib/admin/**`.

### Triggers d'héritage

Sur les tables filles (`lignes_devis`, `composants_ligne_devis`, `lignes_facture`, `tier_corps_etat`, etc.), un trigger `BEFORE INSERT` propage automatiquement `entreprise_id` depuis le parent et vérifie la cohérence si l'app le fournit (migration 0044). Garde-fou contre les bugs de cross-tenant accidentel.

### Génération de numéros per-entreprise

La fonction Postgres `generate_numero(type, entreprise_id)` (refondue en 0043) maintient une **séquence distincte par entreprise** : chaque tenant a son propre compteur `D-2026-000001`, indépendant des autres entreprises. Le helper [lib/numbering/generate.ts](../lib/numbering/generate.ts) requiert désormais une transaction Drizzle (`tx`) et l'`entrepriseId` explicite.

### Numérotation des migrations

- `0037_entreprises_core.sql` — tables `entreprises`, `utilisateur_entreprises`, seed `default`, flag `is_super_admin`, rôle système `super_admin`.
- `0037a_create_app_admin_role.sql` — création du rôle DB `app_admin` BYPASSRLS (à appliquer en superuser).
- `0038_add_entreprise_id_referentiels.sql` — catalogue (9 tables).
- `0039_add_entreprise_id_tiers_commercial.sql` — tiers historique + commercial (8 tables).
- `0040_add_entreprise_id_chantiers_rh.sql` — chantiers + RH (7 tables).
- `0041_add_entreprise_id_facturation.sql` — facturation + numérotation + audit_log nullable (6 tables).
- `0041b_add_entreprise_id_tier_referencement.sql` — module Référencement Tiers (10 tables, défensif via `to_regclass`).
- `0042_rescope_unique_indexes.sql` — passage des `UNIQUE(code)` globaux en `UNIQUE(entreprise_id, code)`.
- `0043_rls_policies.sql` — `ENABLE/FORCE RLS` + policies sur 41 tables + refonte `generate_numero(type, entreprise_id)`.
- `0044_inheritance_triggers.sql` — triggers BEFORE INSERT propageant `entreprise_id` parent → enfant sur 24 tables filles.
- `0045_entreprise_logos_conditions.sql` — tables `entreprise_logos` et `entreprise_conditions` (déjà tenant-scoped par construction).
