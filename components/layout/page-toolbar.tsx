import * as React from 'react';

import { cn } from '@/lib/utils';

type PageToolbarProps = {
  /** Titre/contexte à gauche (ex. « Factures »). */
  title?: React.ReactNode;
  /** Sous-contexte optionnel (compteur, statut…). */
  subtitle?: React.ReactNode;
  /** Actions alignées à droite. */
  actions?: React.ReactNode;
  /** Contenu central libre (ex. onglets, étapes de workflow). */
  children?: React.ReactNode;
  className?: string;
};

/**
 * Bandeau d'actions figé réutilisable, cohérent avec `workflow-devis` et les
 * maquettes : sticky sous le header (`top-14`), pleine largeur (marges
 * négatives qui annulent le padding du `<main>`), titre à gauche, actions à
 * droite. À utiliser en tête des pages de section (remplace l'en-tête de
 * section `<h1 text-3xl>`).
 */
export function PageToolbar({
  title,
  subtitle,
  actions,
  children,
  className,
}: PageToolbarProps) {
  return (
    <div
      className={cn(
        'sticky top-14 z-10 -mx-4 -mt-6 mb-6 border-b bg-card px-4 py-3 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        {(title || subtitle) && (
          <div className="flex min-w-0 flex-col">
            {title && (
              <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
            )}
            {subtitle && (
              <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
            )}
          </div>
        )}
        {children ? <div className="min-w-0 flex-1">{children}</div> : <div className="flex-1" />}
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
