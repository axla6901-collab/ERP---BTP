'use client';

import {
  Building2Icon,
  CalculatorIcon,
  CalendarRangeIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FileTextIcon,
  HardHatIcon,
  HandshakeIcon,
  LayoutDashboardIcon,
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ShieldIcon,
  ShoppingCartIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { SignOutButton } from '@/components/auth/sign-out-button';
import { EntrepriseSwitcher } from '@/components/layout/entreprise-switcher';
import { GuardedLink } from '@/components/layout/guarded-link';
import { useSidebar } from '@/components/layout/sidebar-context';
import { LIBELLES_ROLE, type Role } from '@/lib/auth/rbac';
import { cn } from '@/lib/utils';

/** Feature flags activables par entreprise. Étendre l'union quand on en ajoute. */
export type FeatureFlag = 'planning' | 'tiers-referencement' | 'compte-prorata';

type NavChild = {
  href: string;
  label: string;
  /** Si défini, l'enfant n'apparaît que si `features[featureFlag]` est `true`. */
  featureFlag?: FeatureFlag;
};

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavChild[];
  /** Rôles autorisés à voir l'entrée. Si absent, visible par tous les rôles authentifiés. */
  rolesAutorises?: readonly Role[];
  /** Si true, n'apparaît que pour `is_super_admin = true`. */
  superAdminOnly?: boolean;
  /** Si true, l'href est utilisé tel quel (pas de préfixe slug tenant). */
  absolu?: boolean;
  /** Si défini, l'entrée n'apparaît que si `features[featureFlag]` est `true`. */
  featureFlag?: FeatureFlag;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboardIcon },
  {
    href: '/catalogue',
    label: 'Catalogue',
    icon: ShoppingCartIcon,
    children: [
      { href: '/catalogue/familles', label: 'Familles' },
      { href: '/catalogue/articles', label: 'Articles' },
    ],
  },
  {
    href: '/tiers',
    label: 'Tiers',
    icon: HandshakeIcon,
    children: [
      { href: '/tiers/fournisseurs', label: 'Fournisseurs' },
      { href: '/tiers/sous-traitants', label: 'Sous-traitants' },
      { href: '/tiers/contacts', label: 'Contacts' },
      {
        href: '/tiers/referencement',
        label: 'Référencement',
        featureFlag: 'tiers-referencement',
      },
    ],
  },
  {
    href: '/commercial',
    label: 'Commercial',
    icon: Building2Icon,
    children: [
      { href: '/commercial', label: 'Aperçu' },
      { href: '/commercial/clients', label: 'Clients' },
      { href: '/commercial/devis', label: 'Devis' },
    ],
  },
  { href: '/chantiers', label: 'Chantiers', icon: HardHatIcon },
  {
    href: '/planning',
    label: 'Planning',
    icon: CalendarRangeIcon,
    featureFlag: 'planning',
  },
  {
    href: '/compte-prorata',
    label: 'Compte prorata',
    icon: CalculatorIcon,
    featureFlag: 'compte-prorata',
  },
  {
    href: '/facturation',
    label: 'Facturation',
    icon: FileTextIcon,
    children: [
      { href: '/facturation/factures', label: 'Factures' },
      { href: '/facturation/situations', label: 'Situations' },
    ],
  },
  {
    href: '/rh',
    label: 'RH & Pointage',
    icon: UsersIcon,
    children: [
      { href: '/rh', label: 'Aperçu' },
      { href: '/rh/employes', label: 'Employés' },
      { href: '/rh/pointages', label: 'Pointages' },
      { href: '/rh/pointages/saisie', label: 'Saisie matrice' },
      { href: '/rh/import', label: 'Import' },
    ],
  },
  {
    href: '/administration',
    label: 'Administration',
    icon: ShieldIcon,
    rolesAutorises: ['admin'],
    children: [
      { href: '/administration/utilisateurs', label: 'Utilisateurs' },
      { href: '/administration/roles', label: 'Rôles & permissions' },
      { href: '/administration/unites', label: 'Unités' },
      { href: '/administration/referentiel-tiers', label: 'Référentiel Tiers' },
      { href: '/administration/entreprise', label: 'Ma société' },
    ],
  },
  {
    href: '/admin/entreprises',
    label: 'Entreprises',
    icon: Building2Icon,
    superAdminOnly: true,
    absolu: true,
  },
  {
    href: '/admin/mcd',
    label: 'MCD',
    icon: DatabaseIcon,
    superAdminOnly: true,
    absolu: true,
  },
];

type AppSidebarProps = {
  email: string;
  role: Role;
  isSuperAdmin?: boolean;
  entrepriseSlug: string;
  entrepriseRaisonSociale: string;
  entreprises: Array<{ id: string; slug: string; raisonSociale: string; isDefault: boolean }>;
  /** Feature flags actifs pour l'entreprise courante. Une entrée NAV qui déclare un
   *  `featureFlag` ne s'affiche que si la clé correspondante est `true`. */
  features?: Partial<Record<FeatureFlag, boolean>>;
};

export function AppSidebar({
  email,
  role,
  isSuperAdmin = false,
  entrepriseSlug,
  entrepriseRaisonSociale,
  entreprises,
  features,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const initiale = email.charAt(0).toUpperCase();

  /** Préfixe un href avec le slug tenant, sauf si l'entrée est marquée `absolu`. */
  const resolveHref = (item: Pick<NavItem, 'href' | 'absolu'>) =>
    item.absolu ? item.href : `/${entrepriseSlug}${item.href}`;
  /** Helper pour les liens hors NAV_ITEMS (header, dashboard, etc.). */
  const tenantHref = (href: string) => `/${entrepriseSlug}${href}`;

  /** Le pathname courant inclut déjà `/${slug}/...` (sauf routes absolues). */
  function isSectionActive(item: NavItem): boolean {
    const fullHref = resolveHref(item);
    if (item.href === '/dashboard') {
      return pathname === fullHref || pathname === `/${entrepriseSlug}`;
    }
    return pathname === fullHref || pathname.startsWith(`${fullHref}/`);
  }

  function toggleExpanded(href: string, currentlyOpen: boolean) {
    setExpanded((prev) => ({ ...prev, [href]: !currentlyOpen }));
  }

  return (
    <>
      {/* Bouton burger — visible uniquement < lg */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-30 inline-flex items-center justify-center rounded-md border bg-background p-2 shadow-sm lg:hidden"
        aria-label="Ouvrir le menu"
      >
        <MenuIcon className="size-5" />
      </button>

      {/* Backdrop mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-orange-200 bg-orange-100 transition-[width,transform] duration-200 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'lg:w-16' : 'lg:w-64',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center gap-2 border-b border-orange-200 px-3',
            collapsed && 'lg:justify-center lg:px-2',
          )}
        >
          <GuardedLink
            href={tenantHref('/dashboard')}
            className={cn(
              'flex min-w-0 items-center gap-2 text-lg font-semibold',
              collapsed && 'lg:hidden',
            )}
            onClick={() => setOpen(false)}
            title="ERP BTP"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded bg-amber-500 text-sm font-bold text-white">
              B
            </span>
            <span className="truncate">ERP BTP</span>
          </GuardedLink>

          {/* Espace flexible : pousse le toggle à droite quand la sidebar est déployée. */}
          <div className={cn('flex-1', collapsed && 'lg:hidden')} />

          {/* Pictogramme de repli/déploiement (desktop) — en haut de la sidebar. */}
          <button
            type="button"
            onClick={toggle}
            className="hidden shrink-0 rounded-md p-2 text-orange-700 transition-colors hover:bg-orange-200/70 lg:inline-flex"
            aria-label={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
            aria-pressed={collapsed}
            title={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
          >
            {collapsed ? (
              <PanelLeftOpenIcon className="size-5" />
            ) : (
              <PanelLeftCloseIcon className="size-5" />
            )}
          </button>

          {/* Fermeture du menu off-canvas (mobile uniquement). */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="shrink-0 lg:hidden"
            aria-label="Fermer le menu"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        <div className={cn('border-b border-orange-200 p-3', collapsed && 'lg:hidden')}>
          <EntrepriseSwitcher
            activeSlug={entrepriseSlug}
            activeRaisonSociale={entrepriseRaisonSociale}
            entreprises={entreprises}
            currentPathname={pathname}
          />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.filter((item) => {
            if (item.superAdminOnly && !isSuperAdmin) return false;
            if (item.rolesAutorises && !item.rolesAutorises.includes(role)) return false;
            if (item.featureFlag && !features?.[item.featureFlag]) return false;
            return true;
          }).map((item) => {
            const { href, label, icon: Icon, children } = item;
            // Filtre les enfants masqués par feature flag — un parent sans enfant
            // visible se rend comme une feuille (pas de chevron, pas d'expansion).
            const visibleChildren =
              children?.filter((c) => !c.featureFlag || features?.[c.featureFlag]) ?? [];
            const sectionActive = isSectionActive(item);
            const isOpen = expanded[href] ?? sectionActive;
            const hasChildren = visibleChildren.length > 0;
            return (
              <div key={href}>
                <div
                  className={cn(
                    'flex items-center rounded-md text-sm font-medium transition-colors',
                    sectionActive
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-orange-900/70 hover:bg-orange-200/70 hover:text-orange-900',
                  )}
                >
                  <GuardedLink
                    href={resolveHref(item)}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex flex-1 items-center gap-3 px-3 py-2',
                      collapsed && 'lg:justify-center lg:px-0',
                    )}
                    title={label}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className={cn(collapsed && 'lg:hidden')}>{label}</span>
                  </GuardedLink>
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(href, isOpen)}
                      className={cn(
                        'flex items-center justify-center px-2 py-2',
                        collapsed && 'lg:hidden',
                      )}
                      aria-label={isOpen ? `Réduire ${label}` : `Développer ${label}`}
                      aria-expanded={isOpen}
                    >
                      <ChevronRightIcon
                        className={cn(
                          'size-4 shrink-0 transition-transform',
                          isOpen && 'rotate-90',
                        )}
                      />
                    </button>
                  )}
                </div>
                {hasChildren && isOpen && (
                  <ul
                    className={cn(
                      'ml-5 mt-1 space-y-0.5 border-l border-orange-200 pl-4',
                      collapsed && 'lg:hidden',
                    )}
                  >
                    {visibleChildren.map((child) => {
                      const fullChildHref = tenantHref(child.href);
                      const childActive =
                        child.href === href
                          ? pathname === fullChildHref
                          : pathname === fullChildHref || pathname.startsWith(`${fullChildHref}/`);
                      return (
                        <li key={child.href}>
                          <GuardedLink
                            href={fullChildHref}
                            onClick={() => setOpen(false)}
                            className={cn(
                              'block rounded-md px-3 py-1.5 text-sm transition-colors',
                              childActive
                                ? 'bg-orange-500 font-medium text-white shadow-sm'
                                : 'text-orange-900/70 hover:bg-orange-200/70 hover:text-orange-900',
                            )}
                          >
                            {child.label}
                          </GuardedLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-orange-200 p-3">
          <GuardedLink
            href="/profile"
            onClick={() => setOpen(false)}
            className={cn(
              'block rounded px-2 py-1 text-sm text-orange-900 hover:bg-orange-200/60',
              collapsed && 'lg:flex lg:justify-center lg:px-0',
            )}
            title={email}
          >
            {collapsed && (
              <span className="hidden size-8 shrink-0 place-items-center rounded-full bg-orange-200 text-xs font-medium text-orange-800 lg:grid">
                {initiale}
              </span>
            )}
            <span className={cn('block', collapsed && 'lg:hidden')}>
              <span className="block truncate font-medium">{email}</span>
              <span className="block text-xs text-orange-700">{LIBELLES_ROLE[role]}</span>
            </span>
          </GuardedLink>
          <div className={cn('mt-2', collapsed && 'lg:hidden')}>
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
