# Runbook — Rotation des secrets

## Quand utiliser

- **Incident** : fuite suspectée d'un secret (commit accidentel, partage de fichier, etc.)
- **Départ collaborateur** : un dev avec accès aux secrets quitte le projet
- **Audit annuel** : rotation préventive recommandée tous les 12 mois
- **Mise en production** : tous les secrets dev doivent être remplacés par des secrets prod

## Préalables

- Stack démarrée (cf. [`infra-locale.md`](infra-locale.md))
- Superuser DB accessible (mot de passe `erpbtp` dans `docker-compose.yml`)
- Docker disponible

## Inventaire des secrets

| Secret                                              | Emplacement                         | Impact en cas de fuite                                            |
| --------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                                | `.env.local`                        | Toutes les sessions actives peuvent être forgées                  |
| `app_rw` / `app_migrator` (mots de passe DB)        | `.env.local` + Postgres             | Accès lecture/écriture aux données métier                         |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (MinIO) | `.env.local` + `docker-compose.yml` | Accès lecture/écriture aux documents                              |
| Superuser DB `erpbtp`                               | `docker-compose.yml`                | Accès total à la DB                                               |
| `SECRET_KEY` GlitchTip                              | `docker-compose.glitchtip.yml`      | Falsification des tokens GlitchTip                                |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`             | `.env.local`                        | Spam de l'instance GlitchTip (DSN public conçu pour être visible) |

## Procédures

### 1. Rotation `BETTER_AUTH_SECRET`

⚠ **Cette rotation invalide TOUTES les sessions actives** — tous les utilisateurs devront se reconnecter.

```powershell
# Générer un nouveau secret
$newSecret = [Convert]::ToBase64String((1..32 | %{[byte](Get-Random -Max 256)}))
Write-Host "BETTER_AUTH_SECRET=$newSecret"

# Mettre à jour .env.local manuellement avec la nouvelle valeur

# Redémarrer Next.js dev
Get-NetTCPConnection -State Listen -LocalPort 3000 | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force
}
pnpm dev
```

### 2. Rotation `app_rw` / `app_migrator` (DB)

Voir [`database-accounts.md`](database-accounts.md) section 4.

### 3. Rotation MinIO

```powershell
# Generer nouveaux credentials
$newKey = "erpbtp_minio_" + (-join ((1..6) | %{[char](Get-Random -Min 97 -Max 123)}))
$newSecret = [Convert]::ToBase64String((1..24 | %{[byte](Get-Random -Max 256)}))

# Pour rotation propre, recreer le user via console MinIO (http://localhost:9001)
# ou utiliser mc admin user add :
docker exec erp-btp-minio mc alias set local http://localhost:9000 erpbtp_minio erpbtp_minio_dev_password
docker exec erp-btp-minio mc admin user add local $newKey $newSecret
docker exec erp-btp-minio mc admin policy attach local readwrite --user $newKey

# Mettre à jour .env.local : S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY

# Supprimer l'ancien user
docker exec erp-btp-minio mc admin user remove local erpbtp_minio
```

**Alternative simple en dev** : `docker compose down -v` puis recréer avec de nouvelles credentials dans `docker-compose.yml`. ⚠ détruit les volumes.

### 4. Rotation superuser DB `erpbtp`

```powershell
$newPwd = [Convert]::ToBase64String((1..24 | %{[byte](Get-Random -Max 256)}))
docker exec erp-btp-postgres psql -U erpbtp -d postgres -c "ALTER USER erpbtp PASSWORD '$newPwd';"

# Mettre à jour docker-compose.yml : POSTGRES_PASSWORD
# Redémarrer le conteneur :
docker compose up -d --force-recreate postgres
```

⚠ Les autres conteneurs qui s'authentifiaient comme `erpbtp` (peu probable, normalement seuls `app_rw` / `app_migrator` sont utilisés) doivent être mis à jour aussi.

### 5. Rotation `SECRET_KEY` GlitchTip

```powershell
$newKey = -join ((1..64) | %{[char](Get-Random -Min 33 -Max 127)})
# Editer docker-compose.glitchtip.yml : SECRET_KEY (dans 2 services : web ET worker)
# Redemarrer :
docker compose -f docker-compose.glitchtip.yml up -d --force-recreate
```

## Vérification post-rotation

Pour chaque secret tourné :

1. Lancer `pnpm dev` et `pnpm typecheck` → doit passer
2. Tenter une connexion via `/login` → fonctionne avec un compte existant
3. Tester une opération qui touche la DB (signup test) → fonctionne
4. Si MinIO : faire un upload signed URL → fonctionne
5. Si GlitchTip : trigger une erreur de test → apparaît dans le projet

## Rollback

- **`.env.local`** : Git ne tracke pas ce fichier, donc pas de `git checkout`. **Garder une copie** de l'ancien `.env.local` avant rotation (ex: `.env.local.before-rotation-2026-05-21`)
- **Postgres** : si rotation `ALTER USER` mal faite → reset via superuser depuis `docker exec`
- **MinIO** : récréer l'ancien user avec ses anciennes credentials (ils ne sont pas hachés en dev)

## Sécurité — bonnes pratiques

- **En prod** : utiliser un coffre de secrets (Scaleway Secret Manager, Vault, AWS Secrets Manager) plutôt que `.env.local`
- **Logger** la rotation dans un journal (qui, quand, quel secret) — pas dans le repo, dans un système séparé
- **Politique de longueur** : 32 bytes random (256 bits) minimum pour les clés cryptographiques
- **Audit** : `git log -p .env.example` pour vérifier qu'aucun secret n'a fuité dans le template
- **Pre-commit hook** : Lefthook est configuré (cf. `lefthook.yml`) — vérifie l'absence d'env vars hardcodés dans le code

## Contacts

- Doc Better Auth secret : <https://www.better-auth.com/docs/basic-usage>
- Doc MinIO admin : <https://min.io/docs/minio/linux/administration/identity-access-management.html>
