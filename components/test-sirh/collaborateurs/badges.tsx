import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  LIBELLES_COURTS_TYPE_CONTRAT,
  LIBELLES_ETAT_VERSION,
  LIBELLES_STATUT_COLLABORATEUR,
  type EtatVersion,
  type StatutCollaborateur,
} from '@/lib/test-sirh/collaborateurs/contrats';
import { LIBELLES_TYPE_CONTRAT, type TypeContratSirh } from '@/lib/validation/test-sirh/enums';

/** Tons des types de contrat (CDI vert, CDD ambre, intérim orange, alternance violet…). */
export const TON_TYPE_CONTRAT: Record<TypeContratSirh, BadgeTone> = {
  cdi: 'emerald',
  cdi_chantier: 'emerald',
  cdd: 'amber',
  saisonnier: 'amber',
  interim: 'orange',
  apprentissage: 'violet',
  professionnalisation: 'violet',
  stage: 'sky',
  autre: 'neutral',
};

/** Badge compact du type de contrat (libellé long en infobulle). Server-compatible. */
export function TypeContratBadge({ type }: { type: TypeContratSirh }) {
  return (
    <Badge tone={TON_TYPE_CONTRAT[type]} title={LIBELLES_TYPE_CONTRAT[type]}>
      {LIBELLES_COURTS_TYPE_CONTRAT[type]}
    </Badge>
  );
}

export const TON_STATUT_COLLABORATEUR: Record<StatutCollaborateur, BadgeTone> = {
  a_venir: 'sky',
  actif: 'emerald',
  depart_prevu: 'amber',
  sorti: 'neutral',
};

export function StatutCollaborateurBadge({ statut }: { statut: StatutCollaborateur }) {
  return (
    <Badge tone={TON_STATUT_COLLABORATEUR[statut]} shape="pill">
      {LIBELLES_STATUT_COLLABORATEUR[statut]}
    </Badge>
  );
}

export const TON_ETAT_VERSION: Record<EtatVersion, BadgeTone> = {
  en_cours: 'emerald',
  a_venir: 'sky',
  remplacee: 'slate',
  terminee: 'neutral',
};

export function EtatVersionBadge({ etat }: { etat: EtatVersion }) {
  return (
    <Badge tone={TON_ETAT_VERSION[etat]} shape="pill">
      {LIBELLES_ETAT_VERSION[etat]}
    </Badge>
  );
}
