import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Badge de statut réutilisable, aligné sur les maquettes :
 * `rounded px-2 py-0.5 text-xs font-medium` avec un ton coloré.
 *
 * Tons principaux (spec maquette) : amber (en cours), emerald (payé/ok),
 * rose (en retard), sky (envoyé/info), violet, neutral (brouillon).
 * Tons additionnels conservés pour les statuts métier existants : slate,
 * indigo, orange.
 *
 * `shape="pill"` arrondit complètement (rounded-full) pour les pastilles
 * d'état (actif/inactif, présence…).
 */
const badgeVariants = cva(
  'inline-flex items-center whitespace-nowrap px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        rose: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
        sky: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
        violet: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
        neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
        slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
        indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
        orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
      },
      shape: {
        default: 'rounded',
        pill: 'rounded-full',
      },
    },
    defaultVariants: {
      tone: 'neutral',
      shape: 'default',
    },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

function Badge({
  className,
  tone,
  shape,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ tone, shape }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
