import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  LIBELLES_STATUT_DEMANDE,
  LIBELLES_STATUT_FRAIS,
  type StatutDemande,
  type StatutFrais,
} from '@/lib/validation/test-sirh/enums';

/** Tons des statuts de demande (absences, heures supplémentaires). */
export const TON_STATUT_DEMANDE: Record<StatutDemande, BadgeTone> = {
  brouillon: 'neutral',
  en_attente: 'amber',
  approuvee: 'emerald',
  refusee: 'rose',
  annulee: 'slate',
};

/** Tons des statuts de note de frais. */
export const TON_STATUT_FRAIS: Record<StatutFrais, BadgeTone> = {
  brouillon: 'neutral',
  soumise: 'amber',
  approuvee: 'sky',
  refusee: 'rose',
  remboursee: 'emerald',
};

export function StatutDemandeBadge({ statut }: { statut: StatutDemande }) {
  return <Badge tone={TON_STATUT_DEMANDE[statut]}>{LIBELLES_STATUT_DEMANDE[statut]}</Badge>;
}

export function StatutFraisBadge({ statut }: { statut: StatutFrais }) {
  return <Badge tone={TON_STATUT_FRAIS[statut]}>{LIBELLES_STATUT_FRAIS[statut]}</Badge>;
}

/** Badge générique pour une valeur d'énumération (libellé + ton par valeur). */
export function EnumBadge<V extends string>({
  valeur,
  libelles,
  tons,
}: {
  valeur: V;
  libelles: Record<V, string>;
  tons: Partial<Record<V, BadgeTone>>;
}) {
  return <Badge tone={tons[valeur] ?? 'neutral'}>{libelles[valeur]}</Badge>;
}

/** Pastille de couleur (type d'absence, équipe). */
export function PastilleCouleur({ couleur, className }: { couleur: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={className ?? 'inline-block size-2.5 shrink-0 rounded-full'}
      style={{ backgroundColor: couleur }}
    />
  );
}
