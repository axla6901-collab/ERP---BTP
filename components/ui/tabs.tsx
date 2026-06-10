import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Onglets soulignés, style maquette : barre `border-b`, onglet actif souligné
 * en amber (`border-b-2 border-amber-500 text-amber-700`).
 *
 * Purement présentationnel — l'état actif est piloté par le parent (URL,
 * useState…). `TabsTrigger` accepte `asChild` pour s'envelopper autour d'un
 * `<Link>` (navigation URL-driven) tout en conservant le style.
 */
function TabsNav({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot="tabs-nav"
      className={cn('flex flex-wrap items-center gap-1 border-b', className)}
      {...props}
    />
  );
}

/** Classes d'un onglet selon son état actif (réutilisable hors composant). */
export function tabsTriggerClasses(active: boolean): string {
  return cn(
    '-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition-colors',
    active
      ? 'border-amber-500 font-medium text-amber-700'
      : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground',
  );
}

function TabsTrigger({
  className,
  active = false,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean; asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="tabs-trigger"
      data-active={active ? '' : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(tabsTriggerClasses(active), className)}
      {...(asChild ? {} : { type: 'button' as const })}
      {...props}
    />
  );
}

export { TabsNav, TabsTrigger };
