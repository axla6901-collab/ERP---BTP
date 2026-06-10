import { expect, test } from '@playwright/test';

import { login, loginViaMagicLink } from './helpers/auth';

/**
 * Tests E2E du parcours d'authentification complet :
 *  - connexion par lien magique (Mailpit) → accès dashboard
 *  - login mot de passe d'un compte existant → logout → redirection
 *  - accès à une page protégée sans cookie → redirect /login
 *
 * NB : l'auto-inscription `/signup` est désactivée (audit sécurité —
 * `emailAndPassword.disableSignUp`). Le premier accès se fait par lien magique
 * sur un compte pré-provisionné ; le test ci-dessous couvre ce parcours et la
 * politique `lib/auth/magic-link-policy.ts` (lien émis uniquement pour un compte
 * existant sans MFA).
 *
 * Pré-requis : stack Docker démarrée (`docker compose up -d`), Mailpit, compte
 * de test pré-seedé (cf. helpers/auth.ts) et `pnpm dev` sur localhost:3000.
 * Voir tests/e2e/README.md.
 */

test.describe('Authentification', () => {
  test('connexion par lien magique → dashboard', async ({ page }) => {
    await loginViaMagicLink(page);
    await expect(page.getByText(/Bienvenue/i)).toBeVisible();
  });

  test('login mot de passe → logout → redirect /login', async ({ page }) => {
    await login(page);
    await expect(page.getByText(/Bienvenue/i)).toBeVisible();

    // Logout
    await page.getByRole('button', { name: /Se déconnecter/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('accès direct /profile sans cookie → redirect /login', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });
});
