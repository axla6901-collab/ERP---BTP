# Runbook — CI GitHub Actions + déploiement

## Quand utiliser

- Première fois que tu veux brancher le repo `erp-btp` à un GitHub distant
- Configurer les secrets GitHub Actions
- Diagnostiquer un échec de CI
- Préparer le passage en prod (Scaleway Serverless Container — formalisé en M6+)

## Préalables

- Compte GitHub
- Repo local `erp-btp` versionné (déjà fait : `.git/` présent depuis M1.2)
- `lefthook` actif (cf. [`infra-locale.md`](infra-locale.md))

## Contexte

Le workflow [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) définit deux jobs :

- **`check`** : `pnpm install` + `pnpm lint` + `pnpm typecheck` + `pnpm test` + `pnpm build` (avec env placeholder)
- **`security`** : `pnpm audit --prod --audit-level=high`

Déclencheurs :

- `push` sur la branche `main`
- `pull_request` ciblant `main`

Pas de déploiement automatique en M1.3 — le déploiement sera ajouté en M6+ (ADR à formaliser).

## Procédure

### 1. Créer le repo GitHub

1. Sur <https://github.com> → bouton **New repository**
2. Nom : `erp-btp` (suggéré ; n'importe quel nom convient)
3. **Privé** (recommandé — le code contient les fondations métier)
4. **Ne pas** initialiser avec README / .gitignore / license — le repo local en a déjà
5. Bouton **Create repository**

### 2. Brancher le remote

GitHub affiche les commandes après création. La voie « existing repository » :

```powershell
cd c:\Users\aacosta\Downloads\Claude\erp-btp
git remote add origin https://github.com/<ton-user>/erp-btp.git
git branch -M main
```

Vérifie :

```powershell
git remote -v
# origin  https://github.com/<ton-user>/erp-btp.git (fetch)
# origin  https://github.com/<ton-user>/erp-btp.git (push)
```

### 3. Premier commit

```powershell
git add .
git status            # relire la liste pour vérifier qu'AUCUN secret ne s'est glissé
git commit -m "M1 — socle ERP BTP (auth, MFA, audit, observabilité)"
```

Lefthook va exécuter `pre-commit` automatiquement (prettier + eslint sur les fichiers staged). Si un job échoue, corriger puis recommiter.

### 4. Premier push

```powershell
git push -u origin main
```

Lefthook va exécuter `pre-push` (typecheck + tests Vitest). Si OK, push effectif.

### 5. Vérifier la CI

1. Ouvrir <https://github.com/<ton-user>/erp-btp/actions>
2. Le workflow `CI` doit apparaître et tourner
3. Cliquer pour voir les logs étape par étape

Durée attendue : ~3-5 minutes au premier run (Node setup, installs, build).

### 6. Configurer les secrets GitHub (pour la prod, M6+)

Pour l'instant la CI utilise des placeholders. Quand on aura un environnement prod (Scaleway), il faudra ajouter :

1. <https://github.com/<ton-user>/erp-btp/settings/secrets/actions>
2. **New repository secret**, créer un par variable :
   - `DATABASE_URL_PROD`
   - `BETTER_AUTH_SECRET_PROD`
   - `S3_ENDPOINT_PROD` / `S3_ACCESS_KEY_ID_PROD` / `S3_SECRET_ACCESS_KEY_PROD`
   - `SENTRY_DSN_PROD`
   - `SCALEWAY_REGISTRY_TOKEN` (pour push de l'image Docker)
3. Étendre `ci.yml` avec un job `deploy` qui déclenche sur tag `v*` ou push `main`

Cette extension sera formalisée par un ADR séparé en M6+.

## Vérification

| Test                                    | Attendu                             |
| --------------------------------------- | ----------------------------------- |
| `git remote -v`                         | URL GitHub                          |
| `git push -u origin main`               | Lefthook pre-push passe + push OK   |
| Page Actions GitHub                     | Workflow `CI` apparaît, status vert |
| Étape `Lint + Typecheck + Test + Build` | 0 erreur (~3-5 min)                 |
| Étape `Security audit`                  | 0 vulnérabilité high+               |

## Rollback

- **Mauvais remote** : `git remote remove origin` puis recommencer étape 2
- **CI rouge sur push initial** : corriger localement → recommiter → repusher. Pas de rollback nécessaire (rien en prod)
- **Secret leaké dans un commit** : `git push --force origin main:refs/heads/main` après réécriture historique. ⚠ Considère le secret comme compromis et le tourner immédiatement (cf. [`rotation-secrets.md`](rotation-secrets.md))

## Sécurité — bonnes pratiques

| Élément                 | Recommandation                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Visibilité du repo      | **Privé** tant que pas d'audit sécurité complet (M5+)                                         |
| `.gitignore`            | Vérifie qu'il ignore `.env.local*`, `.claude/` (déjà fait depuis M1.2)                        |
| Pre-commit Lefthook     | Bloque les commits avec erreurs de format/lint                                                |
| Branche `main` protégée | Configurer **branch protection rules** en M2+ : require PR review, require status checks (CI) |
| Dependabot              | À activer (Settings → Code security and analysis → Dependabot alerts)                         |

## Contacts

- Workflow source : [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- Doc GitHub Actions : <https://docs.github.com/en/actions>
- Doc Scaleway deploy (M6+) : à venir
