import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const baseConfig: PlaywrightTestConfig = {
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    {
      name: 'tablet',
      use: {
        // iPad gen 7 viewport 810×1080 mais on force Chromium pour ne pas
        // dépendre d'une install WebKit additionnelle. La taille du viewport
        // suffit à déclencher les breakpoints responsive (< lg = 1024 px).
        ...devices['iPad (gen 7)'],
        defaultBrowserType: 'chromium',
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
};

export default defineConfig(
  process.env.CI ? { ...baseConfig, workers: 1 } : baseConfig,
);
