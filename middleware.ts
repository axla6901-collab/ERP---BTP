import { type NextRequest, NextResponse } from 'next/server';

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

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Auth check
  if (!hasSessionCookie(request)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect_to', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Racine → redirige vers /select-entreprise ou /${slug}/dashboard
  if (pathname === '/' || pathname === '') {
    const activeSlug = request.cookies.get(ACTIVE_ENTREPRISE_COOKIE)?.value;
    if (activeSlug) {
      return NextResponse.redirect(new URL(`/${activeSlug}/dashboard`, request.url));
    }
    return NextResponse.redirect(new URL('/select-entreprise', request.url));
  }

  // 3. URL legacy (route métier sans slug d'entreprise) → préfixe avec le
  //    slug actif, ou bascule vers /select-entreprise si aucun slug en cookie.
  //    Évite la 404 sur les anciens signets et liens externes.
  if (estRouteTenantLegacy(pathname) && !estRouteHorsTenant(pathname)) {
    const activeSlug = request.cookies.get(ACTIVE_ENTREPRISE_COOKIE)?.value;
    if (activeSlug) {
      return NextResponse.redirect(
        new URL(`/${activeSlug}${pathname}${search}`, request.url),
      );
    }
    const fallback = new URL('/select-entreprise', request.url);
    fallback.searchParams.set('redirect_to', `${pathname}${search}`);
    return NextResponse.redirect(fallback);
  }

  return NextResponse.next();
}

export const config = {
  // Protège tout sauf : routes auth Better-Auth, pages d'auth publiques,
  // assets statiques, et les ressources PWA. Le layout tenant
  // `[entrepriseSlug]/layout.tsx` valide que le slug existe et que
  // l'utilisateur en est membre (notFound sinon).
  //
  // PWA (M5.5) : `sw.js`, `manifest.webmanifest` et `icons/` doivent être
  // servis SANS session (référencés depuis /login, requis pour installer la
  // PWA et amorcer le service worker) — sinon ils sont redirigés vers /login.
  matcher: [
    '/((?!api/auth|api/entreprise/switch|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons|login|signup|verify-email|magic-link-sent|two-factor).*)',
  ],
};
