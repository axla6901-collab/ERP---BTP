import { expect, test } from '@playwright/test';

import { login } from './helpers/auth';

/**
 * Tests E2E du flux multi-tenant :
 *  - connexion → auto-redirect vers /{slug}/dashboard (1 seule entreprise)
 *  - cookie `active_entreprise_slug` posé après auto-select
 *  - les routes legacy `/catalogue/...` redirigent vers `/{slug}/catalogue/...`
 *  - le sélecteur d'entreprise est visible dans la sidebar
 *  - un slug d'entreprise dont l'utilisateur n'est pas membre → 404
 *
 * Pré-requis :
 *  - Stack Docker démarrée (`docker compose up -d`)
 *  - Migrations multi-tenant appliquées (entreprise `default` existante)
 *  - Compte test `test@erp-btp.local` membre de `default` (cf. helpers/auth.ts)
 *  - `pnpm dev` sur localhost:3000
 *
 * NB : on n'a qu'une seule entreprise (default) en local, donc le sélecteur
 * doit afficher un badge en lecture seule et non un dropdown.
 *
 * NB : l'auto-inscription `/signup` est désactivée (audit sécurité) ; le
 * provisioning passe par le compte de test pré-seedé (cf. helpers/auth.ts).
 */

test.describe('Multi-tenant', () => {
  test('après connexion, redirection auto vers /default/dashboard + cookie posé', async ({
    page,
    context,
  }) => {
    await login(page);

    // Auto-sélection de l'unique entreprise → /default/dashboard
    await expect(page).toHaveURL(/\/default\/dashboard/, { timeout: 10_000 });

    // Cookie httpOnly posé
    const cookies = await context.cookies();
    const cookie = cookies.find((c) => c.name === 'active_entreprise_slug');
    expect(cookie?.value).toBe('default');
    expect(cookie?.httpOnly).toBe(true);
  });

  test('URL legacy /catalogue/articles redirige vers /default/catalogue/articles', async ({
    page,
  }) => {
    await login(page);

    // Tentative d'accès à une URL legacy mono-tenant
    await page.goto('/catalogue/articles');
    await expect(page).toHaveURL(/\/default\/catalogue\/articles/, { timeout: 5_000 });
  });

  test('la sidebar affiche l\'entreprise active', async ({ page }) => {
    await login(page);

    // Le nom de l'entreprise default doit être visible (badge ou dropdown)
    await expect(page.getByText(/Entreprise par défaut/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('accès à un slug d\'entreprise inexistant → 404', async ({ page }) => {
    await login(page);

    // Tentative d'accès à une entreprise dont l'user n'est PAS membre
    const response = await page.goto('/entreprise-inexistante/catalogue/articles');
    expect(response?.status()).toBe(404);
  });
});
