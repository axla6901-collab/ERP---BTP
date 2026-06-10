import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  LIBELLES_STATUT_AGREMENT,
  type StatutAgrement,
} from '@/lib/validation/referencement-tiers';

const TONE_STATUT_AGREMENT: Record<StatutAgrement, BadgeTone> = {
  a_creer: 'neutral',
  en_attente_documents: 'amber',
  agree: 'emerald',
  refuse_auto: 'rose',
  refuse_manuel: 'rose',
  suspendu: 'orange',
};

export function StatutAgrementBadge({ statut }: { statut: StatutAgrement }) {
  return <Badge tone={TONE_STATUT_AGREMENT[statut]}>{LIBELLES_STATUT_AGREMENT[statut]}</Badge>;
}
