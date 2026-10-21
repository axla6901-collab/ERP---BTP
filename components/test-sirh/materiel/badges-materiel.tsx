import { Badge, type BadgeTone } from '@/components/ui/badge';
import { formatDateFr } from '@/lib/test-sirh/format';
import { alerteControle } from '@/lib/test-sirh/materiel/regles';
import { LIBELLES_STATUT_MATERIEL, type StatutMateriel } from '@/lib/validation/test-sirh/enums';

/** Tons des statuts de matériel. */
export const TON_STATUT_MATERIEL: Record<StatutMateriel, BadgeTone> = {
  en_stock: 'sky',
  attribue: 'emerald',
  en_reparation: 'amber',
  perdu: 'rose',
  reforme: 'slate',
};

export function StatutMaterielBadge({ statut }: { statut: StatutMateriel }) {
  return <Badge tone={TON_STATUT_MATERIEL[statut]}>{LIBELLES_STATUT_MATERIEL[statut]}</Badge>;
}

/** Date du prochain contrôle / péremption + badge « Dépassé » (rose) ou « ≤ 30 j » (ambre). */
export function ControleMateriel({
  dateControle,
  today,
  statut = null,
}: {
  dateControle: string | null;
  today: string;
  statut?: StatutMateriel | null;
}) {
  if (!dateControle) return <span className="text-muted-foreground">—</span>;
  const alerte = alerteControle(dateControle, today, statut);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="tabular-nums">{formatDateFr(dateControle)}</span>
      {alerte === 'depassee' && <Badge tone="rose">Dépassé</Badge>}
      {alerte === 'proche' && <Badge tone="amber">≤ 30 j</Badge>}
    </span>
  );
}
