import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  LIBELLES_STATUT_ECHEANCE_ENTRETIEN,
  type StatutEcheanceEntretien,
} from '@/lib/test-sirh/entretiens/echeances';
import {
  LIBELLES_STATUT_CAMPAGNE,
  LIBELLES_STATUT_ENTRETIEN,
  LIBELLES_STATUT_OBJECTIF,
  type StatutCampagne,
  type StatutEntretien,
  type StatutObjectif,
  type TypeEntretien,
} from '@/lib/validation/test-sirh/enums';

/** Libellés courts des types d'entretien (tableaux, badges). */
export const LIBELLES_COURTS_TYPE_ENTRETIEN: Record<TypeEntretien, string> = {
  annuel: 'Annuel',
  professionnel: 'Professionnel',
  fin_periode_essai: 'Fin de période d’essai',
  mi_annee: 'Mi-année',
  bilan_6_ans: 'Bilan 6 ans',
  autre: 'Autre',
};

export const TON_STATUT_ENTRETIEN: Record<StatutEntretien, BadgeTone> = {
  a_planifier: 'amber',
  planifie: 'sky',
  realise: 'violet',
  signe: 'emerald',
  annule: 'slate',
};

export const TON_STATUT_CAMPAGNE: Record<StatutCampagne, BadgeTone> = {
  brouillon: 'neutral',
  en_cours: 'amber',
  cloturee: 'emerald',
};

export const TON_STATUT_OBJECTIF: Record<StatutObjectif, BadgeTone> = {
  en_cours: 'sky',
  atteint: 'emerald',
  partiellement_atteint: 'amber',
  non_atteint: 'rose',
  abandonne: 'slate',
};

export const TON_STATUT_ECHEANCE: Record<StatutEcheanceEntretien, BadgeTone> = {
  a_jour: 'emerald',
  a_planifier: 'amber',
  en_retard: 'rose',
};

export function StatutEntretienBadge({ statut }: { statut: StatutEntretien }) {
  return <Badge tone={TON_STATUT_ENTRETIEN[statut]}>{LIBELLES_STATUT_ENTRETIEN[statut]}</Badge>;
}

export function StatutCampagneBadge({ statut }: { statut: StatutCampagne }) {
  return <Badge tone={TON_STATUT_CAMPAGNE[statut]}>{LIBELLES_STATUT_CAMPAGNE[statut]}</Badge>;
}

export function StatutObjectifBadge({ statut }: { statut: StatutObjectif }) {
  return <Badge tone={TON_STATUT_OBJECTIF[statut]}>{LIBELLES_STATUT_OBJECTIF[statut]}</Badge>;
}

export function StatutEcheanceBadge({ statut }: { statut: StatutEcheanceEntretien }) {
  return (
    <Badge tone={TON_STATUT_ECHEANCE[statut]} shape="pill">
      {LIBELLES_STATUT_ECHEANCE_ENTRETIEN[statut]}
    </Badge>
  );
}
