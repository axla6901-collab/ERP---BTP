import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Lien = { href: string; label: string };

/**
 * Navigation ‹ précédent · période · suivant › (semaine de la feuille de temps,
 * mois des heures sup.). Server-compatible : les URL sont calculées par la page.
 */
export function NavigationPeriode({
  libelle,
  precedent,
  suivant,
  courant,
}: {
  libelle: string;
  precedent: Lien;
  suivant: Lien;
  /** Lien « retour à aujourd'hui » (masqué si la période affichée est la courante). */
  courant?: Lien | null;
}) {
  const bouton = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'px-2');
  return (
    <nav aria-label="Navigation par période" className="flex flex-wrap items-center gap-2">
      <Link
        href={precedent.href}
        className={bouton}
        aria-label={precedent.label}
        title={precedent.label}
      >
        <ChevronLeftIcon className="size-4" />
      </Link>
      <span className="min-w-0 text-sm font-medium tabular-nums">{libelle}</span>
      <Link href={suivant.href} className={bouton} aria-label={suivant.label} title={suivant.label}>
        <ChevronRightIcon className="size-4" />
      </Link>
      {courant && (
        <Link href={courant.href} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          {courant.label}
        </Link>
      )}
    </nav>
  );
}
