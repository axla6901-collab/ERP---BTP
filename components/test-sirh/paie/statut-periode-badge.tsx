import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  LIBELLES_SOURCE_VARIABLE,
  LIBELLES_STATUT_PERIODE_PAIE,
  type SourceVariable,
  type StatutPeriodePaie,
} from '@/lib/validation/test-sirh/enums';

/** Tons des statuts de période de paie. */
export const TON_STATUT_PERIODE: Record<StatutPeriodePaie, BadgeTone> = {
  ouverte: 'sky',
  en_controle: 'amber',
  cloturee: 'emerald',
};

export function StatutPeriodeBadge({ statut }: { statut: StatutPeriodePaie }) {
  return (
    <Badge tone={TON_STATUT_PERIODE[statut]} shape="pill">
      {LIBELLES_STATUT_PERIODE_PAIE[statut]}
    </Badge>
  );
}

const TON_SOURCE: Record<SourceVariable, BadgeTone> = {
  manuelle: 'neutral',
  absence: 'violet',
  heures_sup: 'orange',
  note_frais: 'sky',
};

const LIBELLES_COURTS_SOURCE: Record<SourceVariable, string> = {
  manuelle: 'Saisie',
  absence: 'Absence',
  heures_sup: 'Heures sup.',
  note_frais: 'Note de frais',
};

/** Origine d'une variable de paie (saisie manuelle ou élément validé importé). */
export function SourceVariableBadge({ source }: { source: SourceVariable }) {
  return (
    <Badge tone={TON_SOURCE[source]} title={LIBELLES_SOURCE_VARIABLE[source]}>
      {LIBELLES_COURTS_SOURCE[source]}
    </Badge>
  );
}
