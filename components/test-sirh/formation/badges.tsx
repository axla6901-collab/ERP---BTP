import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  LIBELLES_STATUT_QUALIFICATION,
  type StatutQualification,
} from '@/lib/test-sirh/formation/validite';
import {
  LIBELLES_RESULTAT_FORMATION,
  LIBELLES_STATUT_INSCRIPTION,
  LIBELLES_STATUT_SESSION,
  type CategorieFormation,
  type ResultatFormation,
  type StatutInscription,
  type StatutSession,
} from '@/lib/validation/test-sirh/enums';

/** Libellés courts des catégories de formation (tableaux). */
export const LIBELLES_COURTS_CATEGORIE_FORMATION: Record<CategorieFormation, string> = {
  securite: 'Sécurité',
  technique: 'Technique',
  reglementaire: 'Réglementaire',
  management: 'Management',
  bureautique: 'Bureautique',
  langues: 'Langues',
  autre: 'Autre',
};

export const TON_STATUT_SESSION: Record<StatutSession, BadgeTone> = {
  planifiee: 'sky',
  confirmee: 'amber',
  realisee: 'emerald',
  annulee: 'slate',
};

export const TON_STATUT_INSCRIPTION: Record<StatutInscription, BadgeTone> = {
  inscrit: 'sky',
  present: 'emerald',
  absent: 'rose',
  annule: 'slate',
};

export const TON_RESULTAT_FORMATION: Record<ResultatFormation, BadgeTone> = {
  non_evalue: 'neutral',
  reussi: 'emerald',
  echoue: 'rose',
};

export const TON_STATUT_QUALIFICATION: Record<StatutQualification, BadgeTone> = {
  valide: 'emerald',
  a_recycler: 'amber',
  expiree: 'rose',
};

export function StatutSessionBadge({ statut }: { statut: StatutSession }) {
  return <Badge tone={TON_STATUT_SESSION[statut]}>{LIBELLES_STATUT_SESSION[statut]}</Badge>;
}

export function StatutInscriptionBadge({ statut }: { statut: StatutInscription }) {
  return (
    <Badge tone={TON_STATUT_INSCRIPTION[statut]} shape="pill">
      {LIBELLES_STATUT_INSCRIPTION[statut]}
    </Badge>
  );
}

export function ResultatFormationBadge({ resultat }: { resultat: ResultatFormation }) {
  return (
    <Badge tone={TON_RESULTAT_FORMATION[resultat]}>{LIBELLES_RESULTAT_FORMATION[resultat]}</Badge>
  );
}

export function StatutQualificationBadge({ statut }: { statut: StatutQualification }) {
  return (
    <Badge tone={TON_STATUT_QUALIFICATION[statut]} shape="pill">
      {LIBELLES_STATUT_QUALIFICATION[statut]}
    </Badge>
  );
}
