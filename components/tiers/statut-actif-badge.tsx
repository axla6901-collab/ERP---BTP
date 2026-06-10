import { cn } from '@/lib/utils';

/**
 * Pastille de statut actif / inactif d'un tiers ou contact.
 *
 * Style aligné sur les badges « État » des grilles tarifaires : pastille
 * `rounded-full` verte (actif) ou grise atténuée (inactif).
 */
export function StatutActifBadge({
  actif,
  className,
}: {
  actif: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        actif ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {actif ? 'Actif' : 'Inactif'}
    </span>
  );
}
