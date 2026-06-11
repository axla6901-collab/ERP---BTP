import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildContentSecurityPolicy,
  s3BrowserOrigins,
  sentryBrowserOrigins,
} from '@/lib/security/csp';

/**
 * Tests de la fonction PURE de construction de la CSP (chantier B3).
 *
 * On teste la chaîne de directives produite selon l'environnement (dev/prod) et
 * les variables d'env (MinIO, Sentry). C'est le garde-fou CI-compatible — les
 * tests E2E ne voient que la CSP de DEV (Playwright tourne contre `pnpm dev`).
 */

const NONCE = 'dGVzdC1ub25jZQ==';

/** Parse une CSP en map directive → set de sources, pour des assertions fines. */
function parseCsp(csp: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...sources] = trimmed.split(/\s+/);
    if (!name) continue;
    out[name] = sources;
  }
  return out;
}

describe('buildContentSecurityPolicy', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    // Repart d'un env propre sans MinIO ni Sentry pour chaque test.
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_FORCE_PATH_STYLE;
    delete process.env.S3_BUCKET_DOCUMENTS;
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('production (strict)', () => {
    it('script-src utilise le nonce + strict-dynamic, sans unsafe-inline ni unsafe-eval', () => {
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      expect(csp['script-src']).toContain("'self'");
      expect(csp['script-src']).toContain(`'nonce-${NONCE}'`);
      expect(csp['script-src']).toContain("'strict-dynamic'");
      expect(csp['script-src']).not.toContain("'unsafe-inline'");
      expect(csp['script-src']).not.toContain("'unsafe-eval'");
    });

    it('ajoute upgrade-insecure-requests', () => {
      const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false });
      expect(csp).toContain('upgrade-insecure-requests');
    });

    it('ne contient pas de schéma websocket (ws/wss) en prod', () => {
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      expect(csp['connect-src']).not.toContain('ws:');
      expect(csp['connect-src']).not.toContain('wss:');
    });
  });

  describe('développement (relâché pour Turbopack/HMR)', () => {
    it("script-src autorise unsafe-inline + unsafe-eval et n'embarque pas de nonce", () => {
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: true }));
      expect(csp['script-src']).toContain("'unsafe-inline'");
      expect(csp['script-src']).toContain("'unsafe-eval'");
      expect(csp['script-src']).not.toContain(`'nonce-${NONCE}'`);
      expect(csp['script-src']).not.toContain("'strict-dynamic'");
    });

    it('connect-src autorise les websockets HMR', () => {
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: true }));
      expect(csp['connect-src']).toContain('ws:');
      expect(csp['connect-src']).toContain('wss:');
    });

    it("n'ajoute pas upgrade-insecure-requests (MinIO local en http)", () => {
      const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: true });
      expect(csp).not.toContain('upgrade-insecure-requests');
    });
  });

  describe('durcissement constant (dev + prod)', () => {
    it.each([true, false])('directives de durcissement présentes (isDev=%s)', (isDev) => {
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev }));
      expect(csp['default-src']).toEqual(["'self'"]);
      expect(csp['frame-ancestors']).toEqual(["'none'"]);
      expect(csp['frame-src']).toEqual(["'none'"]);
      expect(csp['object-src']).toEqual(["'none'"]);
      expect(csp['base-uri']).toEqual(["'self'"]);
      expect(csp['form-action']).toEqual(["'self'"]);
      expect(csp['worker-src']).toEqual(["'self'"]);
      expect(csp['manifest-src']).toEqual(["'self'"]);
      // Verrou anti-handler inline (onclick=…), dev comme prod.
      expect(csp['script-src-attr']).toEqual(["'none'"]);
    });

    it("style-src tolère 'unsafe-inline' (recharts/Gantt/sonner/next-font)", () => {
      for (const isDev of [true, false]) {
        const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev }));
        expect(csp['style-src']).toContain("'self'");
        expect(csp['style-src']).toContain("'unsafe-inline'");
      }
    });

    it('img-src autorise self, data: et blob:', () => {
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      expect(csp['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:']));
    });
  });

  describe('origine MinIO/S3', () => {
    it("injecte l'origine nue en path-style (connect-src + img-src)", () => {
      process.env.S3_ENDPOINT = 'https://s3.example.com';
      process.env.S3_FORCE_PATH_STYLE = 'true';
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      expect(csp['connect-src']).toContain('https://s3.example.com');
      expect(csp['img-src']).toContain('https://s3.example.com');
      // Pas de sous-domaine bucket en path-style.
      expect(csp['connect-src']).not.toContain('https://erp-btp-documents.s3.example.com');
    });

    it('ajoute le sous-domaine bucket en virtual-host style (défaut)', () => {
      process.env.S3_ENDPOINT = 'https://s3.fr-par.scw.cloud';
      process.env.S3_BUCKET_DOCUMENTS = 'mon-bucket';
      // S3_FORCE_PATH_STYLE absent => virtual-host
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      expect(csp['connect-src']).toContain('https://s3.fr-par.scw.cloud');
      expect(csp['connect-src']).toContain('https://mon-bucket.s3.fr-par.scw.cloud');
      expect(csp['img-src']).toContain('https://mon-bucket.s3.fr-par.scw.cloud');
    });

    it('conserve le port (MinIO local)', () => {
      process.env.S3_ENDPOINT = 'http://localhost:9000';
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: true }));
      expect(csp['connect-src']).toContain('http://localhost:9000');
      expect(csp['connect-src']).toContain('http://erp-btp-documents.localhost:9000');
    });

    it("n'ajoute rien si S3_ENDPOINT est absent ou invalide", () => {
      expect(s3BrowserOrigins()).toEqual([]);
      process.env.S3_ENDPOINT = 'pas-une-url';
      expect(s3BrowserOrigins()).toEqual([]);
    });
  });

  describe('origine Sentry/GlitchTip', () => {
    it("ajoute l'origine d'ingest dans connect-src si le DSN est défini", () => {
      process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://abc123@glitchtip.example.com:8000/42';
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      expect(csp['connect-src']).toContain('https://glitchtip.example.com:8000');
    });

    it("n'ajoute rien si le DSN est absent", () => {
      expect(sentryBrowserOrigins()).toEqual([]);
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      // connect-src ne contient que 'self' quand aucune origine externe n'est définie.
      expect(csp['connect-src']).toEqual(["'self'"]);
    });
  });

  describe("origine de l'app (client Better-Auth)", () => {
    it('ajoute NEXT_PUBLIC_APP_URL à connect-src si défini', () => {
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      expect(csp['connect-src']).toContain('https://app.example.com');
    });
  });

  describe('upgrade-insecure-requests vs MinIO en http', () => {
    it("n'émet PAS upgrade-insecure-requests si une origine S3 est en http (prod auto-hébergé)", () => {
      process.env.S3_ENDPOINT = 'http://minio.interne:9000';
      process.env.S3_FORCE_PATH_STYLE = 'true';
      const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false });
      expect(csp).not.toContain('upgrade-insecure-requests');
      // …mais l'origine http reste autorisée (sinon uploads/logos cassés).
      const parsed = parseCsp(csp);
      expect(parsed['connect-src']).toContain('http://minio.interne:9000');
      expect(parsed['img-src']).toContain('http://minio.interne:9000');
    });

    it('émet upgrade-insecure-requests si toutes les origines sont https (prod)', () => {
      process.env.S3_ENDPOINT = 'https://s3.example.com';
      process.env.S3_FORCE_PATH_STYLE = 'true';
      const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false });
      expect(csp).toContain('upgrade-insecure-requests');
    });
  });

  describe('reporting des violations', () => {
    it('déclare report-uri et report-to', () => {
      const csp = parseCsp(buildContentSecurityPolicy({ nonce: NONCE, isDev: false }));
      expect(csp['report-uri']).toEqual(['/api/csp-report']);
      expect(csp['report-to']).toEqual(['csp-endpoint']);
    });
  });
});
