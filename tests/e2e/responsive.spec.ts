import { expect, test, type Page } from '@playwright/test';

import { login } from './helpers/auth';

/**
 * Tests E2E de responsive design.
 *
 * Le fichier s'exécute automatiquement sous chaque projet Playwright
 * (chromium = desktop 1280, mobile-chrome = Pixel 5 ~393, tablet = iPad gen 7
 * ~810). Les assertions dépendent de la viewport courante : on lit
 * `page.viewportSize()` pour décider si on est sous ou au-dessus du breakpoint
 * Tailwind `lg` (1024 px).
 *
 * Pré-requis :
 *  - Stack Docker démarrée et migrations appliquées.
 *  - `pnpm dev` sur localhost:3000 (Playwright le démarre via webServer).
 *  - Compte test `test@erp-btp.local` / `TestPassword123!` présent
 *    (cf. README, créé par les seeds M1.2).
 */

const LG_BREAKPOINT = 1024;

/** Pages internes à parcourir pour vérifier l'absence de scroll horizontal. */
const INTERNAL_PATHS = [
  '/default/dashboard',
  '/default/catalogue/articles',
  '/default/commercial/clients',
  '/default/chantiers',
] as const;

async function expectNoHorizontalOverflow(page: Page, context: string) {
  // Petit délai pour laisser les fonts/icônes finir de monter, sinon faux
  // positifs dûs à un FOUC.
  await page.waitForLoadState('networkidle');
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // Tolérance de 1 px pour arrondis sub-pixel des navigateurs.
  expect(
    scrollWidth,
    `Overflow horizontal détecté sur ${context} (scrollWidth=${scrollWidth}, clientWidth=${clientWidth})`,
  ).toBeLessThanOrEqual(clientWidth + 1);
}

test.describe('Responsive — pages publiques', () => {
  test('login : pas de scroll horizontal', async ({ page }) => {
    await page.goto('/login');
    await expectNoHorizontalOverflow(page, '/login');
  });
});

test.describe('Responsive — sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('comportement sidebar selon le viewport', async ({ page }) => {
    const vp = page.viewportSize();
    const isMobile = !vp || vp.width < LG_BREAKPOINT;

    const burger = page.getByRole('button', { name: /Ouvrir le menu/i });
    const sidebar = page.locator('aside').first();

    if (isMobile) {
      // Burger visible
      await expect(burger).toBeVisible();
      // Sidebar hors écran au repos : translate-x absent ou x < 0
      const box = await sidebar.boundingBox();
      // Sur mobile la sidebar est en position `-translate-x-full` donc x doit
      // être négatif ou hors viewport.
      expect(box?.x ?? -1000).toBeLessThan(0);

      // Ouverture via burger
      await burger.click();
      // Après ouverture la sidebar doit être visible (x >= 0)
      await expect(async () => {
        const opened = await sidebar.boundingBox();
        expect(opened?.x ?? -1).toBeGreaterThanOrEqual(0);
      }).toPass({ timeout: 2_000 });

      // Fermeture via la touche Escape ou click sur backdrop hors de la
      // sidebar (largeur 256px → clic à droite de cette zone).
      const backdrop = page.locator('div[aria-hidden="true"].fixed.inset-0');
      const vpWidth = vp?.width ?? 400;
      await backdrop.click({ position: { x: vpWidth - 20, y: 100 } });
      await expect(async () => {
        const closed = await sidebar.boundingBox();
        expect(closed?.x ?? 0).toBeLessThan(0);
      }).toPass({ timeout: 2_000 });
    } else {
      // Desktop : burger caché, sidebar visible
      await expect(burger).toBeHidden();
      const box = await sidebar.boundingBox();
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect(box?.width ?? 0).toBeGreaterThan(200);
    }
  });
});

test.describe('Responsive — pas de scroll horizontal sur les pages clés', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const path of INTERNAL_PATHS) {
    test(`${path} ne déborde pas horizontalement`, async ({ page }) => {
      await page.goto(path);
      await expectNoHorizontalOverflow(page, path);
    });
  }

  test('dashboard : grille de tuiles 1 col en mobile', async ({ page }) => {
    await page.goto('/default/dashboard');
    const vp = page.viewportSize();
    const isMobile = !vp || vp.width < 640; // sm breakpoint Tailwind

    // Le dashboard expose `<ul class="grid gap-2 sm:grid-cols-2">` — sans
    // préfixe = 1 col par défaut, 2 col à sm+.
    const grid = page.locator('ul.grid').first();
    await expect(grid).toBeVisible();
    const tpl = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns,
    );
    const colCount = tpl.trim().split(/\s+/).length;
    if (isMobile) {
      expect(colCount, `dashboard grid columns sur mobile = ${tpl}`).toBe(1);
    } else {
      expect(colCount, `dashboard grid columns sur ≥sm = ${tpl}`).toBeGreaterThanOrEqual(2);
    }
  });
});
