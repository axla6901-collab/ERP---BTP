'use client';

import { ChevronRightIcon, HomeIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';

import { GuardedLink } from '@/components/layout/guarded-link';
import { buildCrumbs } from '@/lib/navigation/breadcrumbs';
import { cn } from '@/lib/utils';

/** Fil d'Ariane dérivé du pathname courant. Skippe le slug d'entreprise et les
 *  segments d'identifiant (UUID, entier). Le dernier crumb est non cliquable.
 *
 *  La logique de construction vit dans `lib/navigation/breadcrumbs.ts`. Ce
 *  composant autonome (barre dédiée) reste disponible ; le fil d'Ariane affiché
 *  par défaut est désormais inline dans `AppHeader`. */
export function Breadcrumb({ entrepriseSlug }: { entrepriseSlug: string }) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname, entrepriseSlug);

  const homeHref = `/${entrepriseSlug}/dashboard`;
  const homeIsCurrent =
    crumbs.length === 0 ||
    (crumbs.length === 1 && crumbs[0]?.href === null && pathname === homeHref);

  return (
    <nav
      aria-label="Fil d'Ariane"
      className="sticky top-14 z-10 border-b bg-muted px-4 py-3 text-sm shadow-sm lg:px-8"
    >
      <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
        <li className="flex items-center">
          {homeIsCurrent ? (
            <span
              aria-current="page"
              className="inline-flex items-center gap-1 font-medium text-foreground"
            >
              <HomeIcon className="size-3.5" aria-hidden="true" />
              <span>Accueil</span>
            </span>
          ) : (
            <GuardedLink
              href={homeHref}
              className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
            >
              <HomeIcon className="size-3.5" aria-hidden="true" />
              <span>Accueil</span>
            </GuardedLink>
          )}
        </li>
        {crumbs.map((crumb, idx) => (
          <li key={`${crumb.label}-${idx}`} className="flex min-w-0 items-center gap-1">
            <ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {crumb.href ? (
              <GuardedLink
                href={crumb.href}
                className="max-w-[8rem] truncate hover:text-foreground hover:underline sm:max-w-[12rem] md:max-w-none"
              >
                {crumb.label}
              </GuardedLink>
            ) : (
              <span
                aria-current="page"
                className={cn(
                  'max-w-[8rem] truncate font-medium text-foreground sm:max-w-[12rem] md:max-w-none',
                )}
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
