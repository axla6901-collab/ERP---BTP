import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Carte de statistique (KPI) réutilisable, extraite du bandeau de facturation
 * et fidèle aux maquettes : `rounded-xl border bg-card p-4 shadow-sm`, petit
 * label gris, grande valeur `tabular-nums`, indice optionnel.
 *
 * Les tons colorent label/valeur/indice et, pour `rose`/`amber`, le conteneur
 * (carte d'alerte / en cours). Classes littérales complètes pour le JIT
 * Tailwind (jamais d'interpolation `bg-${tone}`).
 */
export type StatTone = 'default' | 'emerald' | 'rose' | 'amber' | 'sky';

const toneContainer: Record<StatTone, string> = {
  default: '',
  emerald: '',
  sky: '',
  rose: 'border-rose-200 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/20',
  amber: 'border-amber-200 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20',
};

const toneLabel: Record<StatTone, string> = {
  default: 'text-muted-foreground',
  emerald: 'text-muted-foreground',
  sky: 'text-muted-foreground',
  rose: 'text-rose-700 dark:text-rose-300',
  amber: 'text-amber-800 dark:text-amber-300',
};

const toneValue: Record<StatTone, string> = {
  default: '',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  sky: 'text-sky-700 dark:text-sky-300',
  rose: 'text-rose-700 dark:text-rose-300',
  amber: 'text-amber-800 dark:text-amber-300',
};

const toneHint: Record<StatTone, string> = {
  default: 'text-muted-foreground',
  emerald: 'text-muted-foreground',
  sky: 'text-muted-foreground',
  rose: 'text-rose-600 dark:text-rose-400',
  amber: 'text-amber-700 dark:text-amber-400',
};

export type StatCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** `| undefined` explicite pour `exactOptionalPropertyTypes` (callers mappant un ton optionnel). */
  tone?: StatTone | undefined;
  className?: string;
};

export function StatCard({ label, value, hint, tone = 'default', className }: StatCardProps) {
  return (
    <div
      data-slot="stat-card"
      className={cn('rounded-xl border bg-card p-4 shadow-sm', toneContainer[tone], className)}
    >
      <div className={cn('text-xs', toneLabel[tone])}>{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', toneValue[tone])}>{value}</div>
      {hint ? <div className={cn('mt-1 text-xs', toneHint[tone])}>{hint}</div> : null}
    </div>
  );
}

/** Grille responsive de `StatCard` (2 colonnes en mobile, 4 dès `sm`). */
export function StatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('grid grid-cols-2 gap-4 sm:grid-cols-4', className)}>{children}</div>;
}
