// Smoke test CSP en navigateur réel (chromium headless) contre le build de PROD
// (CSP stricte à nonce, mode enforce). Capte les `securitypolicyviolation` + les
// erreurs console CSP sur les pages publiques ET authentifiées. Fichier jetable.
import { chromium } from '@playwright/test';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const violations = [];
const consoleErrors = [];
const steps = [];

const browser = await chromium.launch();
const context = await browser.newContext();
// Enregistre chaque violation CSP dans window.__csp (avant tout script de page).
await context.addInitScript(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__csp.push({
      directive: e.effectiveDirective || e.violatedDirective,
      blocked: e.blockedURI,
      sample: e.sample,
    });
  });
});

const page = await context.newPage();
page.on('console', (msg) => {
  if (
    msg.type() === 'error' &&
    /content security policy|refused to (execute|load|apply|connect)/i.test(msg.text())
  ) {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

async function collect(label) {
  const v = await page.evaluate(() => window.__csp || []);
  for (const item of v) violations.push({ at: label, ...item });
}

async function visit(path, label) {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(700); // laisse l'hydratation + styles injectés s'exécuter
  await collect(label);
  steps.push(`${label} (${path}) chargé`);
}

// 1) Pages publiques — script-src nonce + hydratation
await visit('/login', 'login');
await visit('/forgot-password', 'forgot-password');
await visit('/reset-password', 'reset-password');

// Hydratation effective : un clic client sur l'onglet "Lien magique" doit réagir
let hydrated = false;
try {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  const btn = page.getByRole('button', { name: /Lien magique/i });
  if (await btn.count()) {
    await btn.first().click({ timeout: 3000 });
    await page.getByRole('button', { name: /Recevoir un lien/i }).waitFor({ timeout: 3000 });
    hydrated = true;
  }
  await collect('login-interaction');
} catch (e) {
  steps.push('hydratation non confirmée : ' + e.message);
}

// 2) Connexion + pages authentifiées — style-src (sonner/recharts/Gantt), connect-src
let authOk = false;
try {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('test@erp-btp.local');
  await page.getByLabel('Mot de passe').fill('TestPassword123!');
  await page.getByRole('button', { name: /Se connecter/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  authOk = true;
  await collect('dashboard');
  steps.push('login → dashboard OK');
  const slug = page.url().match(/\/([^/]+)\/dashboard/)?.[1];
  if (slug) {
    for (const p of [`/${slug}/planning`, `/${slug}/rh/pointages`, `/${slug}/commercial/devis`]) {
      try {
        await visit(p, 'auth:' + p);
      } catch (e) {
        steps.push('skip ' + p + ' : ' + e.message.split('\n')[0]);
      }
    }
  }
} catch (e) {
  steps.push('AUTH non testée : ' + e.message.split('\n')[0]);
}

await browser.close();

console.log('=== ÉTAPES ===');
for (const s of steps) console.log(' - ' + s);
console.log(`hydrated=${hydrated} authOk=${authOk}`);
console.log(`=== VIOLATIONS CSP (securitypolicyviolation) : ${violations.length} ===`);
for (const v of violations) console.log('  ' + JSON.stringify(v));
console.log(`=== ERREURS CONSOLE CSP : ${consoleErrors.length} ===`);
for (const e of consoleErrors) console.log('  - ' + e);
console.log(violations.length || consoleErrors.length ? 'RESULT=FAIL' : 'RESULT=PASS');
process.exit(violations.length || consoleErrors.length ? 1 : 0);
