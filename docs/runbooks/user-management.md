# Runbook — Gestion des utilisateurs

## Quand utiliser

- Promouvoir un nouveau compte au rôle `admin` (la première fois, à l'installation)
- Changer le rôle d'un utilisateur existant (passage `lecture_seule` → `chef_chantier`, etc.)
- Désactiver un compte (départ collaborateur, suspicion de fuite)
- Supprimer définitivement un compte (RGPD — droit à l'oubli)

## Préalables

- Stack Docker démarrée (cf. [`infra-locale.md`](infra-locale.md))
- Accès en lecture/écriture à Postgres via Drizzle Studio ou `psql`

## Contexte

L'application utilise **deux tables liées** pour l'identité :

- **`user`** (gérée par Better Auth) — colonnes : `id`, `name`, `email`, `email_verified`, `image`, `two_factor_enabled`. **Ne pas modifier manuellement** sauf pour `email_verified` ou suppression. Better Auth re-synchronise.
- **`utilisateurs`** (schéma applicatif, [ADR-002](../adr/002-user-vs-employe.md)) — colonnes : `id` (FK vers `user.id`), `email`, `role` (`role_utilisateur` enum), `employe_id`, `actif`, `derniere_connexion_at`, `created_at`, `updated_at`, `deleted_at`.

La création d'un compte via `/signup` crée automatiquement les deux lignes (rôle par défaut : `lecture_seule`) via le hook Better Auth `databaseHooks.user.create.after`.

## Procédure

### 1. Promouvoir le premier admin

À l'installation, **personne n'est admin**. La procédure d'escalade initiale :

1. Inscris-toi sur <http://localhost:3000/signup> avec ton email principal
2. Récupère l'email de vérification dans Mailpit (<http://localhost:8025>) et clique le lien
3. Connecte-toi
4. Lance le script CLI :

   ```powershell
   pnpm bootstrap:admin ton@email.fr
   ```

   Sorties possibles :
   - `✅ ton@email.fr promu admin (ancien rôle : lecture_seule).`
   - `❌ Aucun compte avec l'email "..."` → vérifie que tu t'es bien inscrit
   - `ℹ️  ton@email.fr est déjà admin. Aucune action.`

5. Déconnecte-toi et reconnecte-toi pour que la nouvelle session reflète le rôle.

> ⚠ Si ton rôle devient `admin` et que tu n'as pas encore activé la MFA, tu seras
> **automatiquement redirigé** vers `/profile/mfa/setup` au prochain accès au
> dashboard (forçage strict MFA, cf. M1.3). Prévois Google Authenticator / Authy
> sur ton téléphone avant de te déconnecter.

Alternative SQL directe (utile pour des cas de figure exotiques) :

```powershell
docker exec -it erp-btp-postgres psql -U erpbtp -d erpbtp -c `
  "UPDATE utilisateurs SET role='admin' WHERE email='ton@email.fr';"
```

### 2. Changer le rôle d'un utilisateur existant

```powershell
docker exec -it erp-btp-postgres psql -U erpbtp -d erpbtp -c `
  "UPDATE utilisateurs SET role='chef_chantier', updated_at=now() WHERE email='collab@entreprise.fr';"
```

Rôles valides (enum `role_utilisateur`) : `admin`, `conducteur_travaux`, `chef_chantier`, `comptable`, `acheteur`, `rh`, `ouvrier`, `lecture_seule`.

L'utilisateur concerné doit **se reconnecter** pour que la nouvelle session reflète le rôle (les sessions actives gardent l'ancien jusqu'à expiration).

### 3. Désactiver un compte (départ collaborateur)

Désactivation **réversible** — l'utilisateur ne peut plus se connecter, mais ses données restent intactes :

```powershell
docker exec -it erp-btp-postgres psql -U erpbtp -d erpbtp -c `
  "UPDATE utilisateurs SET actif=false, updated_at=now() WHERE email='ancien@entreprise.fr';"
```

`requireAuth()` rejette les comptes `actif=false` et redirige vers `/login`.

Pour révoquer immédiatement les sessions actives (forcer la déconnexion) :

```powershell
docker exec -it erp-btp-postgres psql -U erpbtp -d erpbtp -c `
  "DELETE FROM session WHERE user_id IN (SELECT id FROM utilisateurs WHERE email='ancien@entreprise.fr');"
```

### 4. Réactiver un compte

```powershell
docker exec -it erp-btp-postgres psql -U erpbtp -d erpbtp -c `
  "UPDATE utilisateurs SET actif=true, updated_at=now() WHERE email='ancien@entreprise.fr';"
```

### 5. Supprimer définitivement un compte (RGPD)

⚠ **Destructif et irréversible**. À utiliser uniquement pour répondre à une demande RGPD ou par décision admin.

La FK `utilisateurs.id REFERENCES user(id) ON DELETE CASCADE` permet de tout supprimer en cascade depuis `user` :

```powershell
docker exec -it erp-btp-postgres psql -U erpbtp -d erpbtp -c `
  "DELETE FROM \"user\" WHERE email='a-supprimer@entreprise.fr';"
```

Cela supprime : la ligne `user`, la ligne `utilisateurs`, toutes les `session`, `account`, `verification`, `two_factor` liées.

**Préserver d'abord les données historiques** (devis créés, audit_log, pointages, etc.) :

- Les FKs `created_by` / `updated_by` qui pointent vers `utilisateurs(id)` empêchent par défaut la suppression (`ON DELETE RESTRICT`). Soit ré-affecter à un compte « système » avant suppression, soit utiliser un soft-delete (`UPDATE utilisateurs SET deleted_at=now(), email='deleted-<id>@erp-btp.local'`).

## Vérification

Après chaque action, vérifier l'état :

```powershell
docker exec -it erp-btp-postgres psql -U erpbtp -d erpbtp -c `
  "SELECT email, role, actif, derniere_connexion_at FROM utilisateurs ORDER BY created_at;"
```

## Rollback

- Promotion erronée → repasser à `lecture_seule` avec la commande de l'étape 2
- Désactivation accidentelle → étape 4
- Suppression définitive → **irréversible** ; restauration uniquement via backup `pg_dump` (cf. `infra-locale.md` § Sauvegarde manuelle)

## Sécurité — bonnes pratiques

- **Ne jamais** partager un compte entre plusieurs utilisateurs (sinon `derniere_connexion_at` et l'audit deviennent inutilisables)
- **Ne jamais** stocker un mot de passe en clair côté base : Better Auth gère le hashing Argon2id automatiquement
- **Toujours** désactiver (`actif=false`) avant suppression définitive — laisse 30 jours pour annuler
- **MFA TOTP** (jalon M1.2) sera obligatoire pour `admin`, `comptable`, `rh` (cf. [ADR-001](../adr/001-stack.md) § Sécurité)

## Contacts

- Doc Better Auth : <https://www.better-auth.com>
- ADR-002 (séparation `user` / `utilisateurs`) : [`docs/adr/002-user-vs-employe.md`](../adr/002-user-vs-employe.md)
