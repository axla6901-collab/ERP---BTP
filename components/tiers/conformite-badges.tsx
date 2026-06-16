import { cn } from '@/lib/utils';
import type { NiveauConformite } from '@/lib/sous-traitance/fiche-synthese';

/**
 * Pastilles dérivées de la fiche sous-traitant, partagées par le bandeau
 * (composant client) et le rail (composant serveur). Aucune logique de hook :
 * purement présentational, donc utilisable des deux côtés.
 */

const TON_CONFORMITE: Record<NiveauConformite, { dot: string; chip: string }> = {
  conforme: { dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-800 ring-emerald-300' },
  vigilance: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-800 ring-amber-300' },
  non_conforme: { dot: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700 ring-rose-300' },
};

export function ConformitePastille({
  niveau,
  label,
  className,
}: {
  niveau: NiveauConformite;
  label: string;
  className?: string;
}) {
  const ton = TON_CONFORMITE[niveau];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
        ton.chip,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', ton.dot)} aria-hidden />
      {label}
    </span>
  );
}

export function RangCascadeBadge({
  rang,
  max,
  depassement = false,
  className,
}: {
  rang: number;
  max: number;
  depassement?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
        depassement
          ? 'bg-rose-100 text-rose-700 ring-rose-300'
          : 'bg-orange-100 text-orange-800 ring-orange-300',
        className,
      )}
      title={depassement ? 'Cascade au-delà de la limite légale (3 niveaux)' : undefined}
    >
      Rang {rang} / {max}
    </span>
  );
}
