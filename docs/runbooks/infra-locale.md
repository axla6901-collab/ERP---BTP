# Runbook — Infrastructure locale (PostgreSQL + MinIO + Mailpit)

## Quand utiliser

- Premier setup du projet sur un nouveau poste
- Reset complet de l'environnement de dev
- Vérification rapide que la stack tourne (avant une démo, après reboot)
- Onboarding d'un nouvel environnement (staging on-prem)

## Préalables

- **Docker Desktop** installé et démarré (Windows 11 Pro le supporte nativement)
- **Node.js 22.x LTS** et **pnpm 9.x** installés
- Repo `erp-btp` cloné, position dans le dossier racine
- Ports `5432`, `9000`, `9001`, `1025`, `8025` libres sur la machine

---

## Procédure

### 1. Démarrer la stack Docker

```powershell
docker compose up -d
```

Premier lancement : Docker télécharge ~500 Mo d'images (postgres-alpine, minio, mailpit). Sortie attendue :

```
[+] Running 3/3
 ✔ Container erp-btp-postgres  Started
 ✔ Container erp-btp-minio     Started
 ✔ Container erp-btp-mailpit   Started
```

Vérifier l'état :

```powershell
docker compose ps
```

Sortie attendue : 3 services `Up X seconds (healthy)`.

### 2. Créer le bucket MinIO (une seule fois)

**Option A — via la console web (recommandé la première fois)** :

1. Ouvrir <http://localhost:9001>
2. Login : `erpbtp_minio` / `erpbtp_minio_dev_password`
3. Menu **Buckets** → **Create Bucket** → nom : `erp-btp-documents` → **Create**

**Option B — via la CLI `mc` embarquée dans l'image MinIO** :

```powershell
docker exec -it erp-btp-minio mc alias set local http://localhost:9000 erpbtp_minio erpbtp_minio_dev_password
docker exec -it erp-btp-minio mc mb local/erp-btp-documents
```

Sortie attendue : `Bucket created successfully `local/erp-btp-documents``.

### 3. Configurer `.env.local`

```powershell
Copy-Item .env.example .env.local
```

Générer un secret Better Auth fort :

```powershell
$secret = [Convert]::ToBase64String((1..32 | ForEach-Object { [byte](Get-Random -Maximum 256) }))
Write-Host "BETTER_AUTH_SECRET=$secret"
```

Ouvrir `.env.local` dans VS Code et coller la valeur dans `BETTER_AUTH_SECRET`. Les autres valeurs sont déjà cohérentes avec `docker-compose.yml`.

### 4. Installer les dépendances et appliquer le schéma

```powershell
pnpm install
pnpm db:push
```

`db:push` synchronise le schéma Drizzle (`db/schema/*.ts`) avec la DB Postgres. Sortie attendue : `[✓] Changes applied`.

### 5. Démarrer l'application

```powershell
pnpm dev
```

Ouvrir <http://localhost:3000> → la page « ERP BTP — Squelette M0 » s'affiche.

---

## Vérification

### Test 1 — Services Docker tous healthy

```powershell
docker compose ps
```

Les 3 services doivent être `Up X minutes (healthy)`. Si l'un est `unhealthy`, voir [Dépannage](#dépannage).

### Test 2 — Connexion DB et tables Better Auth

```powershell
pnpm db:studio
```

Ouvre <https://local.drizzle.studio>. Doit afficher les 5 tables créées par Better Auth : `user`, `session`, `account`, `verification`, `two_factor`.

### Test 3 — Console MinIO

<http://localhost:9001> → login → bucket `erp-btp-documents` visible avec 0 objets.

### Test 4 — Mailpit accessible

<http://localhost:8025> → interface webmail vide.

### Test 5 — Endpoint Better Auth répond

```powershell
curl http://localhost:3000/api/auth/get-session
```

Sortie attendue : `null` (pas de session active).

---

## Mise en pause / reprise

```powershell
docker compose stop      # Arrête sans détruire (volumes préservés)
docker compose start     # Reprend où on en était
```

## Reset complet (perte des données)

```powershell
docker compose down -v   # Supprime conteneurs ET volumes
docker compose up -d     # Recrée tout à zéro
```

⚠ `-v` supprime les volumes `postgres_data` et `minio_data` : toutes les données dev sont perdues.

## Sauvegarde manuelle (dev)

```powershell
# DB
docker exec erp-btp-postgres pg_dump -U erpbtp erpbtp > backup-$(Get-Date -Format yyyy-MM-dd).sql

# Storage (nécessite mc alias configuré, cf. étape 2 option B)
docker exec erp-btp-minio mc mirror local/erp-btp-documents /tmp/backup-minio
docker cp erp-btp-minio:/tmp/backup-minio ./backup-minio-$(Get-Date -Format yyyy-MM-dd)
```

Procédure de sauvegarde **production** sera couverte par un runbook `backup-restore.md` dédié en M2.

---

## Dépannage

### `postgres` ne démarre pas (`unhealthy`)

```powershell
docker compose logs postgres
```

Causes fréquentes :

- Port `5432` déjà utilisé par un autre Postgres (vérifier avec `netstat -ano | findstr :5432`)
- Volume `postgres_data` corrompu après un kill brutal → `docker compose down -v` (perte des données)

### `minio` ne démarre pas

```powershell
docker compose logs minio
```

Vérifier que les ports `9000` et `9001` sont libres.

### `pnpm db:push` échoue avec `ECONNREFUSED`

- Postgres pas encore prêt : attendre 10 secondes et réessayer
- `DATABASE_URL` mal formé dans `.env.local`

### `pnpm dev` échoue avec `DATABASE_URL est requis`

- Vérifier que `.env.local` existe et que `DATABASE_URL` est renseigné
- Vérifier que Next.js lit bien `.env.local` (redémarrer `pnpm dev`)

### Better Auth refuse de signer (`BETTER_AUTH_SECRET is required`)

- Le secret n'a pas été généré : refaire l'étape 3
- Le secret est trop court : Better Auth exige 32 octets minimum (= 44 caractères en base64)

---

## Sécurité — à retenir

| Élément                                 | Visibilité                                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` (dev)                    | Secret local — ne JAMAIS commiter `.env.local`                                                                |
| `BETTER_AUTH_SECRET`                    | Secret absolu — utilisé pour signer les sessions, fuite = tous les tokens compromis                           |
| `S3_SECRET_ACCESS_KEY`                  | Secret local — change-le en prod                                                                              |
| Mots de passe dans `docker-compose.yml` | **Développement uniquement** — la production utilise des secrets gérés (variables d'env du host, vault, etc.) |
| Ports exposés (`5432`, `9000`, etc.)    | Bindés sur `localhost` uniquement — ne pas binder sur `0.0.0.0` sans reverse proxy                            |

En cas de fuite suspectée :

1. Régénérer `BETTER_AUTH_SECRET` → invalide toutes les sessions actives
2. Régénérer les credentials MinIO via la console (Identity → Users) puis mettre à jour `.env.local`
3. Rotation du mot de passe Postgres : recréer le conteneur avec un nouveau `POSTGRES_PASSWORD` puis `pnpm db:push`

---

## Rollback

Cette procédure est **non destructive** sauf utilisation explicite de `docker compose down -v`.

Si le poste se retrouve dans un état incohérent : `docker compose down -v && docker compose up -d` repart de zéro. Aucune donnée prod n'est touchée.

## Contacts

- Doc PostgreSQL : <https://www.postgresql.org/docs/16/>
- Doc MinIO : <https://min.io/docs/minio/container/index.html>
- Doc Mailpit : <https://mailpit.axllent.org/docs/>
- Doc Better Auth : <https://www.better-auth.com>
- Doc Drizzle : <https://orm.drizzle.team/docs/overview>
