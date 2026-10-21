import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
import { cn } from '@/lib/utils';

/**
 * Petits éléments de présentation du domaine Absences (server-compatible) :
 * libellé de type d'absence avec sa pastille de couleur.
 */
export function TypeAbsenceLibelle({
  libelle,
  code,
  couleur,
  className,
}: {
  libelle: string;
  code?: string | null;
  couleur: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <PastilleCouleur couleur={couleur} />
      <span className="truncate">{libelle}</span>
      {code && <span className="shrink-0 text-xs text-muted-foreground">{code}</span>}
    </span>
  );
}
