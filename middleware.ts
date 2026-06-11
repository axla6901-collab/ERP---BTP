import { type NextRequest, NextResponse } from 'next/server';

import { buildContentSecurityPolicy, CSP_REPORT_GROUP } from '@/lib/security/csp';

// Better Auth v1.x cookie pour les sessions (préfixe `__Secure-` ajouté
// automatiquement en HTTPS — on cherche le nom sans préfixe ici).
const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

const ACTIVE_ENTREPRISE_COOKIE = 'active_entreprise_slug';

/** Routes métier qui ont été déplacées sous /[entrepriseSlug]/...
 *  Un GET sur l'ancienne URL legacy doit être redirigé vers la version
 *  préfixée par le slug d'entreprise actif. */
const ROUTES_TENANT_PREFIXES = [
  '/dashboard',
  '/catalogue',
  '/tiers',
  '/commercial',
  '/chantiers',
  '/facturation',
  '/rh',
  '/administration',
];

/** Routes (app) qui restent hors-tenant. */
const ROUTES_HORS_TENANT = ['/profile', '/select-entreprise'];

/** Pages d'authentification publiques. La CSP doit s'y appliquer (formulaires,
 *  surface publique exposée) MAIS la redirection auth/tenant ne doit PAS s'y
 *  exécuter — sinon /login se redirigerait vers /login (boucle). */
const PUBLIC_AUTH_PATHS = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/magic-link-sent',
  '/two-factor',
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

function estRouteTenantLegacy(pathname: string): boolean {
  return ROUTES_TENANT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function estRouteHorsTenant(pathname: string): boolean {
  return ROUTES_HORS_TENANT.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function estPublicAuth(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Nonce CSP par requête — runtime Edge : Web Crypto + btoa (pas de Buffer). */
function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // --- Content-Security-Policy (B3) : nonce par requête, posé sur la requête
  // (pour que Next nonce ses <script> et expose x-nonce) ET sur la réponse. ---
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = buildContentSecurityPolicy({ nonce, isDev });
  // Bascule d'observation : Content-Security-Policy-Report-Only si demandé,
  // pour valider les directives sans rien bloquer pendant un déploiement.
  const cspHeaderName =
    process.env.CSP_REPORT_ONLY === 'true'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(cspHeaderName, csp);

  // Endpoint absolu de collecte des violations (directive `report-to`), dérivé
  // de l'origine de la requête.
  const reportingEndpoint = `${request.nextUrl.origin}/api/csp-report`;

  const passthrough = () => NextResponse.next({ request: { headers: requestHeaders } });

  const withCsp = (response: NextResponse): NextResponse => {
    response.headers.set(cspHeaderName, csp);
    response.headers.set('Reporting-Endpoints', `${CSP_REPORT_GROUP}="${reportingEndpoint}"`);
    return response;
  };

  // Pages d'auth publiques : CSP appliquée, redirection auth/tenant ignorée.
  if (estPublicAuth(pathname)) {
    return withCsp(passthrough());
  }

  // 1. Auth check
  if (!hasSessionCookie(request)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect_to', pathname);
    return withCsp(NextResponse.redirect(loginUrl));
  }

  // 2. Racine → redirige vers /select-entreprise ou /${slug}/dashboard
  if (pathname === '/' || pathname === '') {
    const activeSlug = request.cookies.get(ACTIVE_ENTREPRISE_COOKIE)?.value;
    if (activeSlug) {
      return withCsp(NextResponse.redirect(new URL(`/${activeSlug}/dashboard`, request.url)));
    }
    return withCsp(NextResponse.redirect(new URL('/select-entreprise', request.url)));
  }

  // 3. URL legacy (route métier sans slug d'entreprise) → préfixe avec le
  //    slug actif, ou bascule vers /select-entreprise si aucun slug en cookie.
  //    Évite la 404 sur les anciens signets et liens externes.
  if (estRouteTenantLegacy(pathname) && !estRouteHorsTenant(pathname)) {
    const activeSlug = request.cookies.get(ACTIVE_ENTREPRISE_COOKIE)?.value;
    if (activeSlug) {
      return withCsp(
        NextResponse.redirect(new URL(`/${activeSlug}${pathname}${search}`, request.url)),
      );
    }
    const fallback = new URL('/select-entreprise', request.url);
    fallback.searchParams.set('redirect_to', `${pathname}${search}`);
    return withCsp(NextResponse.redirect(fallback));
  }

  return withCsp(passthrough());
}

export const config = {
  // Protège tout sauf : routes auth Better-Auth, switch d'entreprise, assets
  // statiques et ressources PWA. Le layout tenant `[entrepriseSlug]/layout.tsx`
  // valide que le slug existe et que l'utilisateur en est membre (notFound sinon).
  //
  // CSP (B3) : contrairement à avant, les pages d'auth publiques (login, signup…)
  // ne sont PLUS exclues du matcher — elles doivent recevoir la CSP. La logique
  // de redirection les ignore via `estPublicAuth()`.
  //
  // PWA (M5.5) : `sw.js`, `manifest.webmanifest` et `icons/` doivent être servis
  // SANS session ET SANS en-tête CSP à nonce (référencés depuis /login, requis
  // pour installer la PWA et amorcer le service worker) → exclus du matcher.
  //
  // `missing` : on n'exécute pas le middleware sur les requêtes de PREFETCH RSC
  // de Next — sinon le nonce d'un prefetch (mis en cache côté client) ne
  // correspondrait plus au nonce du document servi ensuite (recommandation
  // officielle Next.js pour la CSP à nonce).
  matcher: [
    {
      source:
        '/((?!api/auth|api/entreprise/switch|api/csp-report|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
