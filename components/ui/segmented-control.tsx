import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Contrôle segmenté (sélection exclusive), style maquette : un groupe de
 * boutons dans un conteneur arrondi, le segment actif sur fond clair surélevé.
 * Sert aux bascules de vue (Tableau / Grille, Gantt / Liste…).
 *
 * Contrôlé : `value` + `onChange`. `role="group"` + `aria-pressed` par segment.
 */
export type SegmentedOption<V extends string> = {
  value: V;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

export function SegmentedControl<V extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-fit items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5',
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md transition-colors',
              size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-1.5',
              active
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
