import { expect, test } from '@playwright/test';

/**
 * Vérifie que les chevrons de la sidebar ouvrent ET ferment tous les sous-menus,
 * y compris celui de la section active.
 */

const SECTIONS_AVEC_ENFANTS = [
  { label: 'Catalogue', enfant: 'Familles' },
  { label: 'Tiers', enfant: 'Fournisseurs' },
  { label: 'Commercial', enfant: 'Clients' },
  { label: 'Facturation', enfant: 'Factures' },
  { label: 'RH & Pointage', enfant: 'Employés' },
] as const;

test.describe('Sidebar chevrons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('test@erp-btp.local');
    await page.getByLabel('Mot de passe').fill('TestPassword123!');
    await page.getByRole('button', { name: /Se connecter/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  test('chevron ouvre puis ferme chaque section depuis le dashboard', async ({ page }) => {
    for (const { label, enfant } of SECTIONS_AVEC_ENFANTS) {
      const chevron = page.getByRole('button', { name: new RegExp(`Développer ${label}`) });
      await expect(chevron).toBeVisible();
      await chevron.click();

      // Le sous-menu doit s'afficher
      await expect(page.getByRole('link', { name: enfant })).toBeVisible();

      // Le bouton change d'aria-label
      const chevronFermer = page.getByRole('button', { name: new RegExp(`Réduire ${label}`) });
      await chevronFermer.click();

      // Le sous-menu disparaît
      await expect(page.getByRole('link', { name: enfant })).toHaveCount(0);
    }
  });

  test('chevron ferme la section active', async ({ page }) => {
    const sidebar = page.locator('aside');

    // Navigue dans Commercial pour le rendre actif
    await sidebar.getByRole('link', { name: 'Commercial', exact: true }).click();
    await expect(page).toHaveURL(/\/commercial/);

    // Sous-menu visible par défaut (section active)
    await expect(sidebar.getByRole('link', { name: 'Clients', exact: true })).toBeVisible();

    // Clic sur le chevron de la section active → doit fermer
    await sidebar.getByRole('button', { name: /Réduire Commercial/ }).click();
    await expect(sidebar.getByRole('link', { name: 'Clients', exact: true })).toHaveCount(0);

    // Clic à nouveau → rouvre
    await sidebar.getByRole('button', { name: /Développer Commercial/ }).click();
    await expect(sidebar.getByRole('link', { name: 'Clients', exact: true })).toBeVisible();
  });
});
