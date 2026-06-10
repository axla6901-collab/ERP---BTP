# Runbook — Comptes DB applicatifs

## Quand utiliser

- Première installation : créer les rôles `app_rw` et `app_migrator`
- Rotation des mots de passe DB (incident, départ collaborateur, audit annuel)
- Comprendre la séparation des privilèges si tu touches au schéma

## Préalables

- Stack Docker démarrée (cf. [`infra-locale.md`](infra-locale.md))
- Accès superuser `erpbtp` (mot de passe défini dans `docker-compose.yml`)

## Contexte

L'application utilise **deux rôles Postgres distincts** :

| Rôle | Privilèges | Utilisé par |
|---|---|---|
| `app_migrator` | DDL + DML (CREATE/ALTER/DROP + SELECT/INSERT/UPDATE/DELETE) | `drizzle-kit` (migrations, `pnpm db:push`, `pnpm db:studio`) |
| `app_rw` | DML uniquement | App Next.js runtime (Better Auth, Server Actions) |

Avantage : si une faille applicative permet à un attaquant d'exécuter du SQL arbitraire via Next.js, il **ne peut pas modifier le schéma** (DROP TABLE, CREATE FUNCTION malveillante, etc.). Limite la surface d'attaque.

Le rôle superuser `erpbtp` n'est utilisé que pour l'**administration** (créer les rôles, restaurer un backup, debug d'urgence) — **jamais** par l'app.

## Procédure

### 1. Première installation

Appliquer la migration SQL :

```powershell
docker cp db/migrations/0001_db_roles.sql erp-btp-postgres:/tmp/0001_db_roles.sql
docker exec erp-btp-postgres psql -U erpbtp -d erpbtp -f /tmp/0001_db_roles.sql
```

La migration est **idempotente** (DO blocks vérifiant l'existence des rôles) — rejouable sans erreur.

### 2. Configuration de `.env.local`

```env
DATABASE_URL=postgresql://app_rw:app_rw_dev_password@localhost:5432/erpbtp
DATABASE_MIGRATOR_URL=postgresql://app_migrator:app_migrator_dev_password@localhost:5432/erpbtp
```

### 3. Vérification

```powershell
# app_rw : SELECT autorisé
docker exec -e PGPASSWORD=app_rw_dev_password erp-btp-postgres psql -U app_rw -d erpbtp `
  -c "SELECT COUNT(*) FROM utilisateurs;"

# app_rw : DDL refusé
docker exec -e PGPASSWORD=app_rw_dev_password erp-btp-postgres psql -U app_rw -d erpbtp `
  -c "CREATE TABLE x (id int);"
# -> ERROR: permission denied for schema public

# app_migrator : DDL autorisé
docker exec -e PGPASSWORD=app_migrator_dev_password erp-btp-postgres psql -U app_migrator -d erpbtp `
  -c "CREATE TABLE x (id int); DROP TABLE x;"
```

### 4. Rotation des mots de passe

⚠️ Le redémarrage de l'app est nécessaire après rotation.

```powershell
# Génère un mot de passe aléatoire
$newPwd = [Convert]::ToBase64String((1..24 | %{[byte](Get-Random -Max 256)}))

# Met à jour Postgres
docker exec erp-btp-postgres psql -U erpbtp -d erpbtp -c "ALTER ROLE app_rw PASSWORD '$newPwd';"

# Met à jour .env.local manuellement avec la nouvelle valeur
# Puis redémarre pnpm dev
```

Idem pour `app_migrator`.

En prod, utiliser un coffre de secrets (Scaleway Secret Manager, Vault, etc.) plutôt que `.env.local`.

## Vérification après rotation

```powershell
docker exec -e PGPASSWORD=$newPwd erp-btp-postgres psql -U app_rw -d erpbtp -c "SELECT 1;"
# -> doit retourner 1
```

## Rollback

Si l'app ne démarre plus après rotation :

1. Rétablir l'ancien mot de passe :
   ```sql
   ALTER ROLE app_rw PASSWORD 'ancien_password';
   ```
2. Restaurer `.env.local` à l'ancienne valeur
3. Redémarrer `pnpm dev`

Si les rôles sont corrompus (incident) :

```powershell
docker exec erp-btp-postgres psql -U erpbtp -d erpbtp -c "DROP ROLE app_rw; DROP ROLE app_migrator;"
# Puis rejouer 0001_db_roles.sql
```

⚠️ **Ne jamais** `DROP DATABASE erpbtp` sans backup `pg_dump` préalable.

## Sécurité — bonnes pratiques

| Élément | Visibilité |
|---|---|
| Mots de passe dans `docker-compose.yml` (`erpbtp`) | **Dev uniquement** — prod utilise un coffre |
| Mots de passe `app_rw` / `app_migrator` | **Secrets** — `.env.local` non commité |
| Superuser `erpbtp` | **Ne pas utiliser dans l'app** — admin seulement |

- **Drizzle Studio** utilise `DATABASE_MIGRATOR_URL` (peut modifier le schéma). Réservé à l'admin.
- **Better Auth** utilise `DATABASE_URL` (DML seulement). Limite l'impact d'une éventuelle injection SQL.
- **Rotation annuelle** recommandée (politique entreprise à formaliser en M3+).

## Contacts

- Migration source : [`db/migrations/0001_db_roles.sql`](../../db/migrations/0001_db_roles.sql)
- Doc Postgres GRANT : <https://www.postgresql.org/docs/16/sql-grant.html>
- Doc Drizzle config : [`drizzle.config.ts`](../../drizzle.config.ts)
