# Runbook — Observabilité (GlitchTip self-hosted)

## Quand utiliser

- Investiguer une erreur runtime côté client ou serveur
- Suivre les performances après mise en prod
- Mettre en place le monitoring sur un nouvel environnement

## Préalables

- Stack erp-btp démarrée (cf. [`infra-locale.md`](infra-locale.md))
- Docker disponible
- ~1 Go de RAM disponible (GlitchTip = 4 conteneurs)

## Contexte

L'app utilise `@sentry/nextjs` pour la capture d'erreurs et de traces de performance. Le SDK est **compatible Sentry SaaS et GlitchTip self-hosted** sans modification du code. Tant que `SENTRY_DSN` est vide dans `.env.local`, le SDK est **no-op** (aucun overhead).

**GlitchTip** est un clone open-source de Sentry, choisi pour cohérence avec l'exigence d'autonomie (cf. [ADR-007](../adr/007-observabilite.md)). Conteneurisé via [`docker-compose.glitchtip.yml`](../../docker-compose.glitchtip.yml).

## Procédure — première mise en place

### 1. Démarrer GlitchTip

```powershell
cd c:\Users\aacosta\Downloads\Claude\erp-btp
docker compose -f docker-compose.glitchtip.yml up -d
```

Premier démarrage : Docker télécharge ~800 Mo d'images. Vérifier l'état :

```powershell
docker compose -f docker-compose.glitchtip.yml ps
```

Attendre que les 4 services soient `healthy` ou `Up`. Le service `glitchtip-web` peut mettre 30-60 secondes à finir ses migrations Django au premier démarrage.

### 2. Créer ton compte admin et un projet

1. Ouvrir <http://localhost:8000>
2. **Sign up** avec ton email (le premier compte créé est automatiquement promu admin)
3. Créer une **Organisation** : `erp-btp`
4. Créer un **Team** : `dev`
5. Créer un **Project** : nom `erp-btp-web`, plateforme **JavaScript → Next.js**
6. Copier le **DSN** affiché (format `https://<key>@<host>:8000/<project_id>`)

### 3. Configurer `.env.local`

```env
SENTRY_DSN=https://<key>@localhost:8000/<project_id>
NEXT_PUBLIC_SENTRY_DSN=https://<key>@localhost:8000/<project_id>
```

### 4. Redémarrer Next.js dev

```powershell
# Tuer le serveur dev en cours
Get-NetTCPConnection -State Listen -LocalPort 3000 | ForEach-Object {
  Stop-Process -Id $_.OwningProcess -Force
}
pnpm dev
```

### 5. Tester la capture d'erreur

Créer une route stub temporaire pour vérifier l'instrumentation :

```powershell
@'
import { NextResponse } from 'next/server';
export function GET() {
  throw new Error('Test capture Sentry/GlitchTip');
  return NextResponse.json({ ok: true });
}
'@ | Out-File -Encoding utf8 app\api\test\boom\route.ts

# Trigger l'erreur
Invoke-WebRequest http://localhost:3000/api/test/boom -UseBasicParsing
```

L'erreur doit apparaître dans GlitchTip <http://localhost:8000/erp-btp/issues>. Supprime ensuite le fichier :

```powershell
Remove-Item app\api\test\boom -Recurse
```

## Mise en pause / reprise

GlitchTip est **lourd** (postgres + redis + web + worker = ~1 Go RAM). Quand tu n'as pas besoin :

```powershell
docker compose -f docker-compose.glitchtip.yml stop
```

Les données restent (volumes nommés Docker). Pour reprendre :

```powershell
docker compose -f docker-compose.glitchtip.yml start
```

## Reset complet (perte des données)

```powershell
docker compose -f docker-compose.glitchtip.yml down -v
```

## Vérification post-installation

1. `http://localhost:8000` accessible
2. Login admin fonctionne
3. Une erreur déclenchée volontairement apparaît dans le projet sous 30 secondes

## Rollback

Désactiver GlitchTip = vider `SENTRY_DSN` et `NEXT_PUBLIC_SENTRY_DSN` dans `.env.local`, puis redémarrer Next.js. Le SDK redevient no-op.

Pour désinstaller complètement :

```powershell
docker compose -f docker-compose.glitchtip.yml down -v
pnpm remove @sentry/nextjs
```

Et retirer les fichiers `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, le wrap `withSentryConfig` dans `next.config.mjs`.

## Sécurité — bonnes pratiques

- **SECRET_KEY GlitchTip** dans `docker-compose.glitchtip.yml` : à **régénérer en prod** (`openssl rand -hex 32`)
- **DSN public** (`NEXT_PUBLIC_SENTRY_DSN`) : visible côté navigateur, normal — c'est conçu pour
- **DSN serveur** (`SENTRY_DSN`) : peut être différent du public ; même valeur en dev pour simplicité
- **PII** : par défaut Sentry/GlitchTip n'envoie pas les inputs utilisateur ; le SDK est configuré sans replay

## Contacts

- Doc GlitchTip : <https://glitchtip.com/documentation>
- Image Docker : <https://hub.docker.com/r/glitchtip/glitchtip>
- Doc Sentry Next.js SDK : <https://docs.sentry.io/platforms/javascript/guides/nextjs/>
