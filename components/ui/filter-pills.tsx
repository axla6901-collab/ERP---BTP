import Link from 'next/link';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Pills de filtre, style maquette (facturation) :
 * - actif : `bg-neutral-900 text-white`
 * - inactif : `border bg-card text-neutral-700 hover:bg-muted`
 * - ton « danger » (ex. « ⚠ En retard ») : `border-rose-200 bg-rose-50 text-rose-700`
 *
 * Chaque pill peut être un `<Link>` (filtre par URL), un `<button>` (onClick
 * côté client) ou un `<span>` inerte. Le compteur optionnel s'affiche atténué
 * à droite du libellé.
 */
export type FilterPillItem = {
  key: string;
  label: React.ReactNode;
  count?: number;
  active?: boolean;
  tone?: 'default' | 'danger';
  href?: string;
  onClick?: () => void;
};

function pillClasses(active: boolean, tone: 'default' | 'danger'): string {
  if (active) {
    return 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900';
  }
  if (tone === 'danger') {
    return 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300';
  }
  return 'border bg-card text-neutral-700 hover:bg-muted dark:text-neutral-300';
}

function PillInner({
  label,
  count,
}: {
  label: React.ReactNode;
  count?: number | undefined;
}) {
  return (
    <>
      {label}
      {typeof count === 'number' && (
        <span className="ml-1 text-current/60 tabular-nums">{count}</span>
      )}
    </>
  );
}

export function FilterPills({
  items,
  className,
  'aria-label': ariaLabel,
}: {
  items: FilterPillItem[];
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.active ?? false;
        const tone = item.tone ?? 'default';
        const base = cn(
          'inline-flex items-center rounded-full px-3 py-1 text-xs transition-colors',
          pillClasses(active, tone),
        );
        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              className={base}
              aria-current={active ? 'true' : undefined}
            >
              <PillInner label={item.label} count={item.count} />
            </Link>
          );
        }
        if (item.onClick) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              className={base}
              aria-pressed={active}
            >
              <PillInner label={item.label} count={item.count} />
            </button>
          );
        }
        return (
          <span key={item.key} className={base}>
            <PillInner label={item.label} count={item.count} />
          </span>
        );
      })}
    </div>
  );
}
