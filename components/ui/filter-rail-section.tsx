import Link from 'next/link';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Bloc de rail de filtres (maquette catalogue) : carte blanche avec un en-tête
 * en petites majuscules et une action optionnelle (« Tout voir »).
 */
export function FilterRailSection({
  title,
  action,
  children,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {title}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * Élément cliquable d'un rail de filtres (ex. une famille). Actif = fond ambre.
 * Rendu en `<Link>` (filtre par URL), `<button>` (onClick) ou `<span>` inerte.
 */
export function FilterRailItem({
  label,
  count,
  active = false,
  href,
  onClick,
}: {
  label: React.ReactNode;
  count?: number;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}) {
  const base = cn(
    'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors',
    active
      ? 'bg-amber-50 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
      : 'text-neutral-700 hover:bg-muted dark:text-neutral-300',
  );
  const inner = (
    <>
      <span className="truncate">{label}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'ml-2 text-xs tabular-nums',
            active ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
          )}
        >
          {count}
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={base} aria-current={active ? 'true' : undefined}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base} aria-pressed={active}>
        {inner}
      </button>
    );
  }
  return <span className={base}>{inner}</span>;
}
