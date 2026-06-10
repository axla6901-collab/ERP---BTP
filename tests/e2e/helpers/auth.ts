import { expect, type Page } from '@playwright/test';

import { clearMailpit, extractAuthLink, waitForMail } from './mailpit';

/**
 * Helpers d'authentification E2E.
 *
 * L'auto-inscription publique (`/signup`) est désactivée (audit sécurité —
 * `emailAndPassword.disableSignUp`). Les tests s'appuient donc sur le compte de
 * test pré-provisionné, membre de l'entreprise `default` :
 *   test@erp-btp.local / TestPassword123!
 * (cf. tests/e2e/README.md — créé par les seeds M1.2).
 */
export const TEST_ACCOUNT = {
  email: 'test@erp-btp.local',
  password: 'TestPassword123!',
} as const;

/**
 * Connexion par mot de passe. Termine sur `/{slug}/dashboard` (auto-sélection
 * de l'unique entreprise `default` + pose du cookie `active_entreprise_slug`).
 */
export async function login(page: Page, account = TEST_ACCOUNT): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mot de passe').fill(account.password);
  await page.getByRole('button', { name: /Se connecter/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * Connexion par lien magique (via Mailpit). Exerce la politique
 * `lib/auth/magic-link-policy.ts` : le lien n'est émis que pour un compte
 * existant **sans** MFA — ce qui est le cas du compte de test.
 */
export async function loginViaMagicLink(
  page: Page,
  email: string = TEST_ACCOUNT.email,
): Promise<void> {
  await clearMailpit();
  await page.goto('/login');
  await page.getByRole('button', { name: /Lien magique/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: /Recevoir un lien de connexion/i }).click();
  await expect(page).toHaveURL(/\/magic-link-sent/);

  const mail = await waitForMail(email);
  await page.goto(extractAuthLink(mail));
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}
