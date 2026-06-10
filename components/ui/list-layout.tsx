import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Disposition « liste avec rail de filtres » des maquettes : un rail latéral
 * gauche à largeur fixe (~288px) et la zone principale flexible. En mobile, le
 * rail s'empile au-dessus de la liste.
 *
 * Implémenté en flex (et non en grille 12 colonnes) : classes ultra-courantes
 * toujours présentes dans le CSS généré — robuste vis-à-vis du JIT Tailwind, et
 * rail à largeur constante quelle que soit la largeur d'écran (fidèle maquette).
 */
export function ListLayout({
  aside,
  children,
  className,
}: {
  aside: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-5 lg:flex-row lg:items-start', className)}>
      <aside className="space-y-4 lg:w-72 lg:shrink-0">{aside}</aside>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  );
}
