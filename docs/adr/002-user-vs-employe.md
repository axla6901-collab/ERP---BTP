# ADR-002 — Séparation des entités `utilisateurs` et `employes`

- **Statut** : Accepté (révisé le 2026-05-21 — voir [ADR-006](006-stack-autonome.md))
- **Date** : 2026-04-21 (initial), 2026-05-21 (révision section synchronisation)
- **Décideur** : @aacosta

## Contexte

Le MCD ne distingue pas explicitement :

- l'**employé métier** (porteur d'attributs BTP : taux horaire, qualification, pointage, éventuel RGE),
- le **compte utilisateur applicatif** (identité d'authentification, rôles RBAC, MFA, traçabilité `created_by` / `updated_by`).

Or ces deux notions ne coïncident pas toujours dans la réalité :

- Un **comptable externe** (expert-comptable, fiduciaire) a besoin d'un compte utilisateur mais n'est pas un employé de la PME BTP.
- Un **ouvrier intérimaire** peut faire l'objet de pointages et apparaître sur les tâches sans jamais se connecter.
- Un **ancien employé** ne doit plus pouvoir s'authentifier (compte désactivé), mais son historique de pointages et ses documents (permis, décennale expirée) doivent rester consultables.
- Un **auditeur temporaire** doit pouvoir consulter sans figurer en RH.

## Décision

Maintenir **deux tables distinctes** dans le schéma public :

- **`utilisateurs`** : identité d'authentification métier (RBAC, MFA, contexte applicatif), liée 1-1 à la table `user` créée par Better Auth (cf. [ADR-006](006-stack-autonome.md)).
- **`employes`** : collaborateur BTP (tous les champs `EMPLOYE` du MCD + extensions RH).

**Lien** : champ `employe_id UUID NULL UNIQUE REFERENCES employes(id)` sur `utilisateurs`. Trois configurations possibles :

| Cas                                                        | `utilisateurs` | `employes` | Lien                                    |
| ---------------------------------------------------------- | -------------- | ---------- | --------------------------------------- |
| Utilisateur externe (comptable, auditeur)                  | ✅             | ❌         | `employe_id = NULL`                     |
| Employé sans accès app (ouvrier non-connecté, intérimaire) | ❌             | ✅         | —                                       |
| Employé avec compte (chef de chantier, admin RH)           | ✅             | ✅         | `utilisateurs.employe_id = employes.id` |

### Table `utilisateurs` (schéma public, étend `user` de Better Auth)

Liée à la table `user` (Better Auth) par FK. Peuplée à la création d'un compte (hook `databaseHooks.user.create.after` de Better Auth) avec rôle par défaut `lecture_seule` (escalade manuelle par un admin).

```sql
CREATE TABLE utilisateurs (
  id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN (
    'admin', 'conducteur_travaux', 'chef_chantier',
    'comptable', 'acheteur', 'rh', 'ouvrier', 'lecture_seule'
  )),
  employe_id UUID NULL UNIQUE REFERENCES employes(id) ON DELETE SET NULL,
  actif BOOLEAN NOT NULL DEFAULT true,
  derniere_connexion_at TIMESTAMPTZ NULL,
  -- Champs techniques transverses
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
```

### Table `employes`

Conforme au MCD + champs RH standards.

```sql
CREATE TABLE employes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricule TEXT UNIQUE NULL,               -- matricule paie
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  poste TEXT NOT NULL,
  qualification TEXT NULL,
  taux_horaire NUMERIC(8,2) NOT NULL CHECK (taux_horaire >= 0),
  email TEXT NULL,                          -- redondant si compte, utile si pas de compte
  telephone TEXT NULL,
  date_entree DATE NOT NULL,
  date_sortie DATE NULL CHECK (date_sortie IS NULL OR date_sortie >= date_entree),
  actif BOOLEAN NOT NULL DEFAULT true,
  -- Cohérence actif / date_sortie
  CHECK (
    (actif = true AND date_sortie IS NULL) OR
    (actif = false AND date_sortie IS NOT NULL)
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT REFERENCES utilisateurs(id),
  updated_by TEXT REFERENCES utilisateurs(id),
  deleted_at TIMESTAMPTZ NULL
);
```

> **Note (révision 2026-05-21)** : Better Auth utilise des identifiants `TEXT` (CUID/nanoid) par défaut. En conséquence, toutes les FKs pointant vers `utilisateurs(id)` (et donc transitivement vers `user(id)`) sont de type `TEXT`, pas `UUID`. Les FKs vers `employes(id)` restent en `UUID`. Cette dualité est volontaire : on isole l'identifiant d'auth (opaque, donné par la lib) de l'identifiant métier (UUID maîtrisé par l'app).

### Relations du MCD re-routées

Les FK du MCD qui pointaient vers `EMPLOYE` sont analysées :

| FK d'origine                                                                   | Redirigée vers     | Raison                                  |
| ------------------------------------------------------------------------------ | ------------------ | --------------------------------------- |
| `CHANTIER.responsable_id`                                                      | `employes(id)`     | Rôle métier, pas un compte              |
| `POINTAGE.employe_id`                                                          | `employes(id)`     | Donnée RH                               |
| `HISTORIQUE_DOCUMENT.employe_id` → renommée **`utilisateur_id`**               | `utilisateurs(id)` | Trace applicative (qui a fait l'action) |
| `ALERTE_DOCUMENT.destinataire_id` → renommée **`destinataire_utilisateur_id`** | `utilisateurs(id)` | Destinataire d'une notif = compte       |
| `DOCUMENT_ADMIN.verifie_par_id`                                                | `utilisateurs(id)` | Qui a validé → action applicative       |
| `created_by`, `updated_by` (toutes tables)                                     | `utilisateurs(id)` | Audit technique                         |

### Synchronisation `user` (Better Auth) ↔ `utilisateurs`

Hook applicatif Better Auth `databaseHooks.user.create.after` qui crée une ligne `utilisateurs` avec un rôle par défaut `lecture_seule` (escalade manuelle par un admin).

Hook `databaseHooks.user.update.after` qui propage les changements d'email. Si Better Auth est court-circuité (insertion DB directe), la FK `ON DELETE CASCADE` garantit la cohérence à la suppression et un check de cohérence quotidien détecte les divergences (cf. mitigations).

## Conséquences

### Positives

- Pas de dérive sécurité : un ancien employé ne peut pas ré-authentifier.
- Comptes externes (comptable, auditeur) possibles sans pollution RH.
- RBAC n'est pas couplé aux données RH → évolue indépendamment.
- Suppression d'un employé possible sans casser la traçabilité applicative (les `created_by` restent valides car ils pointent vers `utilisateurs`).

### Négatives / Risques

- Un peu plus de jointures dans les requêtes "qui fait quoi sur un chantier" (jointure `utilisateurs` → `employes`).
- **Synchronisation** entre `user` (Better Auth) et `utilisateurs` (RBAC métier) via hook applicatif. Risque de divergence si le hook échoue silencieusement. **Mitigation** : FK `ON DELETE CASCADE` + script de réconciliation quotidien (`SELECT id FROM "user" WHERE id NOT IN (SELECT id FROM utilisateurs WHERE deleted_at IS NULL)`).
- Double source de l'email (`utilisateurs.email` et `employes.email`) : à nettoyer soit par contrainte de cohérence si les deux existent, soit en assumant la duplication.

### Mitigations

- Script de vérification quotidien : count(`user`) == count(`utilisateurs` WHERE deleted_at IS NULL).
- Documentation claire dans le runbook `docs/runbooks/user-management.md` (à créer M1).

## Alternatives considérées

1. **Une seule table `utilisateurs` avec tous les champs EMPLOYE optionnels** — rejetée : mélange des préoccupations, complique le RBAC, fuite des données RH dans la couche auth, rend difficile la suppression sélective (un employé anonymisé mais compte conservé).
2. **Utiliser directement la table `user` de Better Auth** — rejetée : on ne veut pas étendre la table de la bibliothèque d'auth (risque de conflit à l'upgrade Better Auth, mélange des préoccupations auth/métier).
3. **`utilisateurs` comme SUBTYPE de `employes`** (PostgreSQL inheritance) — rejetée : l'héritage en Postgres est anti-pattern pour les FK (ne se propage pas), complique les migrations.

## Révision

À revisiter si :

- Plus jamais d'utilisateurs externes (tous les comptes = employés) → simplification possible en fusionnant.
- Introduction de profils multiples (un utilisateur = plusieurs employés dans différentes entités juridiques) → évolution vers une table de jonction `utilisateur_employe`.
