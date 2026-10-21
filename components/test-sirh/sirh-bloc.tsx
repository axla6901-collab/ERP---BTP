import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Carte de section du module Test SIRH (titre orange + description + contenu),
 * identique au `Bloc` des fiches Flotte. Server-compatible.
 */
export function SirhBloc({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Actions alignées à droite de l'en-tête (boutons, liens). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-orange-700">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn('border-t px-5 py-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** État vide homogène (bordure pointillée). */
export function SirhVide({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
