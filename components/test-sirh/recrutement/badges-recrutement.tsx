import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  LIBELLES_AVIS_RECRUTEMENT,
  LIBELLES_ETAPE_CANDIDATURE,
  LIBELLES_STATUT_OFFRE,
  type AvisRecrutement,
  type EtapeCandidature,
  type StatutOffre,
} from '@/lib/validation/test-sirh/enums';

/** Tons des statuts d'offre d'emploi. */
export const TON_STATUT_OFFRE: Record<StatutOffre, BadgeTone> = {
  brouillon: 'neutral',
  publiee: 'emerald',
  suspendue: 'amber',
  pourvue: 'sky',
  fermee: 'slate',
};

/** Tons des étapes de candidature (pipeline actif ambre/orange, clôtures colorées). */
export const TON_ETAPE_CANDIDATURE: Record<EtapeCandidature, BadgeTone> = {
  nouvelle: 'neutral',
  preselection: 'amber',
  entretien_rh: 'orange',
  entretien_technique: 'orange',
  proposition: 'violet',
  embauche: 'emerald',
  refusee: 'rose',
  desistement: 'slate',
};

export const TON_AVIS_RECRUTEMENT: Record<AvisRecrutement, BadgeTone> = {
  favorable: 'emerald',
  reserve: 'amber',
  defavorable: 'rose',
};

export function StatutOffreBadge({ statut }: { statut: StatutOffre }) {
  return (
    <Badge tone={TON_STATUT_OFFRE[statut]} shape="pill">
      {LIBELLES_STATUT_OFFRE[statut]}
    </Badge>
  );
}

export function EtapeCandidatureBadge({ etape }: { etape: EtapeCandidature }) {
  return <Badge tone={TON_ETAPE_CANDIDATURE[etape]}>{LIBELLES_ETAPE_CANDIDATURE[etape]}</Badge>;
}

export function AvisRecrutementBadge({ avis }: { avis: AvisRecrutement }) {
  return <Badge tone={TON_AVIS_RECRUTEMENT[avis]}>{LIBELLES_AVIS_RECRUTEMENT[avis]}</Badge>;
}
