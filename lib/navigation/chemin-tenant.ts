/**
 * Modules métier servis sous `/[entrepriseSlug]/…` (un dossier par module dans
 * `app/(app)/[entrepriseSlug]/`, vérifié par test). Un chemin qui commence par
 * l'un d'eux sans slug (`/catalogue/articles`) est un chemin « legacy » : le
 * suivre coûte une redirection du middleware (aller-retour de plus) ou, depuis
 * une page dont le squelette est déjà streamé, une redirection côté navigateur.
 */
export const MODULES_TENANT = [
  'administration',
  'catalogue',
  'chantiers',
  'commercial',
  'compte-prorata',
  'dashboard',
  'facturation',
  'flotte',
  'planning',
  'rh',
  'test-sirh',
  'tiers',
] as const;

function estModuleTenant(segment: string | undefined): boolean {
  return segment !== undefined && (MODULES_TENANT as readonly string[]).includes(segment);
}

/**
 * Préfixe par le slug d'entreprise un chemin de module métier :
 * `cheminTenant('acme', '/catalogue/articles')` → `/acme/catalogue/articles`.
 *
 * Laisse intact tout le reste — chemin déjà préfixé, routes hors tenant
 * (`/profile`, `/admin/…`), URL absolues ou relatives, slug absent. Cette
 * idempotence permet de l'appliquer au point de navigation (lien, `router.push`)
 * sans savoir si l'appelant a déjà préfixé.
 */
export function cheminTenant(slug: string, chemin: string): string {
  if (!slug || !chemin.startsWith('/') || chemin.startsWith('//')) return chemin;
  const [, premier, second] = (chemin.split(/[?#]/)[0] ?? '').split('/');
  // `/acme/catalogue…` : déjà préfixé (le 2e segment est un module). Le test
  // sur le 2e segment garde juste un slug homonyme d'un module (`/rh/rh/…`).
  if (premier === slug && estModuleTenant(second)) return chemin;
  return estModuleTenant(premier) ? `/${slug}${chemin}` : chemin;
}
