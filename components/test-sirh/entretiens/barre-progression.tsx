import { cn } from '@/lib/utils';

/**
 * Barre de progression horizontale (0–100 %), server-compatible. La largeur est
 * dynamique (style inline) ; les couleurs restent des classes littérales.
 */
export function BarreProgression({
  valeur,
  ton = 'amber',
  className,
  libelle,
}: {
  /** Pourcentage (borné à 0–100) ; null = 0. */
  valeur: number | null;
  ton?: 'amber' | 'emerald' | 'rose';
  className?: string;
  /** Libellé accessible (aria-label). */
  libelle?: string;
}) {
  const pct = Math.min(100, Math.max(0, Math.round(valeur ?? 0)));
  const couleur =
    ton === 'emerald' ? 'bg-emerald-500' : ton === 'rose' ? 'bg-rose-500' : 'bg-amber-500';
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={libelle}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className={cn('h-full rounded-full', couleur)} style={{ width: `${pct}%` }} />
    </div>
  );
}
