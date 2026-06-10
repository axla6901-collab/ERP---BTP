/**
 * Construction du fil d'Ariane à partir du `pathname`. Logique pure (sans JSX
 * ni hooks) → testable côté unit sans DOM et réutilisable dans `AppHeader`.
 */

/** Mapping segment d'URL → libellé FR. Les segments absents sont titlecasés. */
export const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Tableau de bord',
  catalogue: 'Catalogue',
  familles: 'Familles',
  articles: 'Articles',
  unites: 'Unités',
  prix: 'Prix',
  composition: 'Composition',
  tiers: 'Tiers',
  fournisseurs: 'Fournisseurs',
  'sous-traitants': 'Sous-traitants',
  contacts: 'Contacts',
  referencement: 'Référencement',
  'referentiel-tiers': 'Référentiel Tiers',
  'corps-etat': 'Corps d’état',
  'natures-document': 'Natures de document',
  correspondance: 'Correspondance',
  'types-engagement': 'Types d’engagement',
  societes: 'Sociétés',
  grilles: 'Grilles tarifaires',
  commercial: 'Commercial',
  clients: 'Clients',
  devis: 'Devis',
  chantiers: 'Chantiers',
  taches: 'Tâches',
  planning: 'Planning',
  facturation: 'Facturation',
  factures: 'Factures',
  situations: 'Situations',
  rh: 'RH & Pointage',
  employes: 'Employés',
  pointages: 'Pointages',
  saisie: 'Saisie matrice',
  import: 'Import',
  administration: 'Administration',
  utilisateurs: 'Utilisateurs',
  roles: 'Rôles & permissions',
  entreprise: 'Ma société',
  entreprises: 'Entreprises',
  mcd: 'MCD',
  nouveau: 'Nouveau',
  nouvelle: 'Nouvelle',
  profile: 'Profil',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isIdSegment(segment: string): boolean {
  if (UUID_RE.test(segment)) return true;
  if (/^\d+$/.test(segment)) return true;
  return false;
}

export function libelleSegment(segment: string): string {
  return SEGMENT_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
}

export type Crumb = { label: string; href: string | null };

/**
 * Construit la liste des crumbs à partir du pathname. Le premier segment (slug
 * d'entreprise) est consommé pour préfixer les hrefs mais n'apparaît pas comme
 * crumb. Les segments d'identifiant (UUID, entier) sont ignorés. Le dernier
 * crumb a `href: null` (non cliquable).
 */
export function buildCrumbs(pathname: string, entrepriseSlug: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== entrepriseSlug) return [];

  const crumbs: Crumb[] = [];
  let hrefAccumule = `/${entrepriseSlug}`;

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]!;
    hrefAccumule += `/${seg}`;
    if (isIdSegment(seg)) continue;
    const isLast = i === segments.length - 1;
    crumbs.push({ label: libelleSegment(seg), href: isLast ? null : hrefAccumule });
  }

  return crumbs;
}
