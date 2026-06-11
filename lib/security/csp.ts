/**
 * Content-Security-Policy de l'application — chantier B3 de l'audit sécurité
 * (`docs/audits/2026-05-28-audit-securite.md`).
 *
 * La CSP est posée PAR REQUÊTE dans `middleware.ts` : elle embarque un nonce
 * unique régénéré à chaque requête, ce qui est impossible via
 * `next.config.headers()` (en-têtes statiques). Next.js lit le token `nonce-…`
 * dans l'en-tête CSP de la requête et l'applique automatiquement à ses propres
 * <script> de bootstrap RSC (et l'expose via `headers().get('x-nonce')`).
 *
 * Stratégie (cf. cartographie des contraintes du repo) :
 *  - script-src : STRICT en prod (`'nonce-…' 'strict-dynamic'`, sans
 *    `'unsafe-inline'`/`'unsafe-eval'`). `'strict-dynamic'` est requis car le
 *    script bootstrap nonçé de Next charge dynamiquement les chunks
 *    `/_next/static/*` (qui n'ont pas de nonce). RELÂCHÉ en dev car Turbopack/HMR
 *    injecte du code `eval` et des scripts non nonçables. Aucun script inline
 *    applicatif n'existe (vérifié : pas de next/script, pas de
 *    dangerouslySetInnerHTML de <script>, pas d'eval).
 *  - style-src : `'unsafe-inline'` ASSUMÉ — recharts, le Gantt, sonner et
 *    next/font posent des styles inline (`style={{}}` + <style> injectés) non
 *    nonçables. Le nonce ne durcit que les scripts ; mélanger nonce et
 *    `'unsafe-inline'` sur style-src ferait ignorer `'unsafe-inline'` par les
 *    navigateurs et casserait le styling.
 *  - connect-src / img-src : origine MinIO/S3 (uploads PUT presignés depuis le
 *    navigateur + logos d'entreprise en <img> / redirection 307) dérivée de
 *    `S3_ENDPOINT` au runtime, + origine Sentry/GlitchTip si
 *    `NEXT_PUBLIC_SENTRY_DSN` est défini.
 *  - worker-src / child-src 'self' : service worker PWA (`public/sw.js`).
 *  - frame-ancestors / frame-src / object-src 'none', base-uri / form-action
 *    'self' : durcissement standard (aucun iframe/object dans le code).
 *
 * Fichier sans dépendance Node : exécutable dans le runtime Edge du middleware
 * ET testable en isolation (vitest). Les variables d'env sont lues à l'appel.
 */

function safeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Origines que le NAVIGATEUR contacte directement sur MinIO/S3 :
 *  - upload PUT presigné des documents (RH / tiers / référencement) → connect-src
 *  - logos d'entreprise affichés en <img> ou via redirection 307 → img-src
 *
 * En virtual-host style (défaut du projet : `S3_FORCE_PATH_STYLE !== 'true'`),
 * l'URL presignée cible `{bucket}.{host}` ; on autorise donc aussi ce
 * sous-domaine en plus de l'origine nue (path-style).
 */
export function s3BrowserOrigins(): string[] {
  const origin = safeOrigin(process.env.S3_ENDPOINT);
  if (!origin) return [];
  const origins = [origin];
  const pathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
  if (!pathStyle) {
    const bucket = process.env.S3_BUCKET_DOCUMENTS ?? 'erp-btp-documents';
    const u = new URL(origin);
    origins.push(`${u.protocol}//${bucket}.${u.host}`);
  }
  return origins;
}

/** Origine d'ingest Sentry/GlitchTip — uniquement si un DSN client est configuré. */
export function sentryBrowserOrigins(): string[] {
  const origin = safeOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
  return origin ? [origin] : [];
}

export interface CspOptions {
  /** Nonce par requête (base64). Utilisé uniquement en production. */
  nonce: string;
  /** true = CSP relâchée pour Turbopack/HMR (pas de nonce, `'unsafe-eval'`, ws). */
  isDev: boolean;
}

/** Chemin de l'endpoint de collecte des violations CSP (report-uri / report-to). */
export const CSP_REPORT_ENDPOINT_PATH = '/api/csp-report';
/** Nom du groupe de reporting (référencé par l'en-tête `Reporting-Endpoints` du middleware). */
export const CSP_REPORT_GROUP = 'csp-endpoint';

export function buildContentSecurityPolicy({ nonce, isDev }: CspOptions): string {
  const s3 = s3BrowserOrigins();
  const sentry = sentryBrowserOrigins();
  // Origine servie au navigateur pour le client Better-Auth : si
  // `NEXT_PUBLIC_APP_URL` diffère de l'origine effective (reverse-proxy, domaine
  // dédié), `'self'` ne suffirait pas pour les fetch d'auth.
  const appOrigin = safeOrigin(process.env.NEXT_PUBLIC_APP_URL);

  // Origines externes que le navigateur contacte en plus du same-origin.
  const externalOrigins = [...s3, ...sentry, ...(appOrigin ? [appOrigin] : [])];

  const scriptSrc = isDev
    ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
    : ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];

  const connectSrc = ["'self'", ...externalOrigins];
  if (isDev) connectSrc.push('ws:', 'wss:');

  const imgSrc = ["'self'", 'data:', 'blob:', ...s3];

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'font-src': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
    'img-src': imgSrc,
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'script-src': scriptSrc,
    // Verrouille l'absence de gestionnaires d'événements inline (`onclick=…`) :
    // ni le nonce ni `'strict-dynamic'` ne régissent les attributs d'événement.
    'script-src-attr': ["'none'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'worker-src': ["'self'"],
    'child-src': ["'self'"],
    'connect-src': connectSrc,
    // Collecte des violations (surtout utile en `Content-Security-Policy-Report-Only`).
    // `report-uri` : large support (legacy) ; `report-to` : moderne (groupe défini
    // par l'en-tête `Reporting-Endpoints` posé dans le middleware).
    'report-uri': [CSP_REPORT_ENDPOINT_PATH],
    'report-to': [CSP_REPORT_GROUP],
  };

  const parts = Object.entries(directives).map(
    ([name, values]) => `${name} ${[...new Set(values)].join(' ')}`,
  );

  // Montée en HTTPS des sous-ressources en production — SAUF si une origine
  // navigateur (MinIO/S3 auto-hébergé) est servie en `http://` : l'upgrade
  // invaliderait la signature presignée. Jamais en dev (MinIO local en http).
  const hasInsecureOrigin = externalOrigins.some((origin) => origin.startsWith('http://'));
  if (!isDev && !hasInsecureOrigin) parts.push('upgrade-insecure-requests');

  return parts.join('; ');
}
