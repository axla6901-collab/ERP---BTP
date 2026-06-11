import { STATUT_SOUS_TRAITANT_LABELS, type StatutSousTraitant } from '@/lib/validation/tiers';
import { cn } from '@/lib/utils';

/**
 * Pastille du statut d'agrément d'un sous-traitant (cycle de vie référencement).
 * Distinct du `StatutActifBadge` (actif/inactif = archivage). Une couleur par
 * étape, alignée sur la sémantique des autres badges du produit.
 */
const TON_PAR_STATUT: Record<StatutSousTraitant, string> = {
  a_qualifier: 'bg-muted text-muted-foreground',
  en_cours_agrement: 'bg-amber-100 text-amber-700',
  agree: 'bg-emerald-100 text-emerald-700',
  suspendu: 'bg-orange-100 text-orange-700',
  refuse: 'bg-rose-100 text-rose-700',
};

export function StatutSousTraitantBadge({
  statut,
  className,
}: {
  statut: StatutSousTraitant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TON_PAR_STATUT[statut],
        className,
      )}
    >
      {STATUT_SOUS_TRAITANT_LABELS[statut]}
    </span>
  );
}
