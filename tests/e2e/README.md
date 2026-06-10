# Tests E2E (Playwright)

Tests de bout en bout du parcours utilisateur. Exécutés via [Playwright](https://playwright.dev/).

## Pré-requis

1. Stack Docker démarrée (Postgres + MinIO + Mailpit) :
   ```powershell
   docker compose up -d
   ```
2. App Next.js qui tourne sur `localhost:3000` :
   ```powershell
   pnpm dev
   ```
   Si l'app n'est pas démarrée, Playwright tente de la lancer automatiquement (voir `webServer` dans [`playwright.config.ts`](../../playwright.config.ts)).
3. Compte de test `test@erp-btp.local` / `TestPassword123!` créé en DB avec email vérifié (créé automatiquement par M1.2 ; cf. [`docs/runbooks/user-management.md`](../../docs/runbooks/user-management.md) si à recréer).
4. Navigateurs Playwright installés une fois :
   ```powershell
   pnpm exec playwright install --with-deps
   ```

## Lancement

```powershell
pnpm test:e2e        # headless, tous les projets (Chromium + mobile)
pnpm test:e2e:ui     # UI interactive (debug)
```

## Couverture actuelle

- `auth.spec.ts` (M1.3)
  - **Test 1** : signup d'un email aléatoire → email Mailpit → vérification → dashboard
  - **Test 2** : login compte existant → logout → redirect /login
  - **Test 3** : accès `/profile` sans cookie → redirect /login

## Helpers

- [`helpers/mailpit.ts`](helpers/mailpit.ts) — interrogation de l'API Mailpit (clear, waitForMail, extractAuthLink)

## Conventions

- **Emails E2E** : préfixe `e2e-<timestamp>@erp-btp.local` pour éviter collision avec données dev
- **Cleanup DB** : non automatisé pour l'instant ; nettoyer manuellement les `e2e-*` après quelques runs :
  ```powershell
  docker exec erp-btp-postgres psql -U erpbtp -d erpbtp -c "DELETE FROM \"user\" WHERE email LIKE 'e2e-%';"
  ```

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Tests timeout 30s | Stack pas démarrée | `docker compose up -d` |
| `Mailpit: aucun message reçu` | Mailpit éteint ou SMTP mal configuré | Vérifier `docker compose ps` + `http://localhost:8025` |
| `Authentication failed for user app_rw` | Mauvais `.env.local` | Recréer depuis `.env.example` (cf. infra-locale.md) |
| Test 1 échoue à `verify-email` | Hook `databaseHooks.user.create.after` plante | Vérifier les logs Next dev pour erreur audit_log / utilisateurs |
