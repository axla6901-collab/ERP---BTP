'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { TabsNav, tabsTriggerClasses } from '@/components/ui/tabs';
import { CHANTIER_TABS, type ChantierTab, type ChantierTabKey } from '@/lib/chantiers/tabs';
import { cn } from '@/lib/utils';

type Props = {
  activeTab: ChantierTabKey;
  basePath: string;
  /** Compteurs optionnels affichés en pastille à côté du label (devis liés, etc.). */
  counts?: Partial<Record<ChantierTabKey, number>>;
  /** Liste d'onglets à afficher (par défaut tous). Permet de filtrer les onglets
   *  optionnels selon les modules activés pour l'entreprise. */
  tabs?: readonly ChantierTab[];
};

/**
 * Nav d'onglets de la fiche chantier. Utilise `?tab=...` dans l'URL pour
 * persister l'onglet actif (bookmarkable, partageable, stable au refresh).
 * Le reste des query params est conservé.
 */
export function ChantierTabs({ activeTab, basePath, counts, tabs = CHANTIER_TABS }: Props) {
  const search = useSearchParams();
  const buildHref = (key: ChantierTabKey) => {
    const params = new URLSearchParams(Array.from(search.entries()));
    params.set('tab', key);
    return `${basePath}?${params.toString()}`;
  };

  return (
    <TabsNav>
      {tabs.map((t) => {
        const active = t.key === activeTab;
        const count = counts?.[t.key];
        return (
          <Link
            key={t.key}
            href={buildHref(t.key)}
            scroll={false}
            className={tabsTriggerClasses(active)}
            aria-current={active ? 'page' : undefined}
          >
            {t.label}
            {typeof count === 'number' && count > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs font-normal',
                  active
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </TabsNav>
  );
}
