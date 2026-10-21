/**
 * Échéances légales de l'entretien professionnel — module PUR (aucune I/O),
 * importable côté client comme serveur.
 *
 * Art. L6315-1 du Code du travail :
 * - tout salarié bénéficie, tous les 2 ans, d'un entretien professionnel
 *   consacré à ses perspectives d'évolution (à compter de son embauche) ;
 * - tous les 6 ans, cet entretien fait un état des lieux récapitulatif du
 *   parcours professionnel (« bilan à 6 ans »), apprécié par référence à
 *   l'ancienneté du salarié dans l'entreprise.
 *
 * Un entretien de type « bilan 6 ans » est lui-même un entretien professionnel :
 * il relance donc aussi le cycle de 2 ans.
 */

import { ajouterMois, differenceJours, type IsoDate } from '../calendrier';
import type { StatutEntretien, TypeEntretien } from '@/lib/validation/test-sirh/enums';

/** Périodicité de l'entretien professionnel (mois). */
export const PERIODICITE_ENTRETIEN_PRO_MOIS = 24;
/** Périodicité de l'état des lieux récapitulatif (mois). */
export const PERIODICITE_BILAN_MOIS = 72;
/** Une échéance à moins de N jours passe « à planifier ». */
export const SEUIL_A_PLANIFIER_JOURS = 60;

/** Types d'entretien qui satisfont l'obligation d'entretien professionnel. */
export const TYPES_ENTRETIEN_PROFESSIONNEL: readonly TypeEntretien[] = [
  'professionnel',
  'bilan_6_ans',
];

/** Statuts d'un entretien effectivement tenu. */
export const STATUTS_ENTRETIEN_REALISE: readonly StatutEntretien[] = ['realise', 'signe'];

/** Statuts d'un entretien encore à tenir. */
export const STATUTS_ENTRETIEN_A_VENIR: readonly StatutEntretien[] = ['a_planifier', 'planifie'];

export type StatutEcheanceEntretien = 'a_jour' | 'a_planifier' | 'en_retard';

export const LIBELLES_STATUT_ECHEANCE_ENTRETIEN: Record<StatutEcheanceEntretien, string> = {
  a_jour: 'À jour',
  a_planifier: 'À planifier',
  en_retard: 'En retard',
};

export function estEntretienProfessionnel(type: TypeEntretien): boolean {
  return TYPES_ENTRETIEN_PROFESSIONNEL.includes(type);
}

export function estEntretienRealise(statut: StatutEntretien): boolean {
  return STATUTS_ENTRETIEN_REALISE.includes(statut);
}

/**
 * Prochain entretien professionnel dû : dernier entretien professionnel réalisé
 * (à défaut, date d'entrée) + 24 mois. `null` si aucune date de référence.
 */
export function prochainEntretienProfessionnel(
  dernierEntretien: IsoDate | null,
  dateEntree: IsoDate | null,
): IsoDate | null {
  const reference = dernierEntretien ?? dateEntree;
  return reference ? ajouterMois(reference, PERIODICITE_ENTRETIEN_PRO_MOIS) : null;
}

/**
 * Échéance du prochain état des lieux récapitulatif (bilan à 6 ans).
 *
 * Avec une date d'entrée, les échéances sont les multiples de 6 ans d'ancienneté
 * (entrée + 6 ans, + 12 ans…). Un bilan réalisé dans les 24 mois qui précèdent
 * une échéance (ou après elle) la couvre : on renvoie la première échéance dont
 * la fenêtre commence après le dernier bilan. Sans date d'entrée : dernier
 * bilan + 6 ans. `null` si aucune date n'est connue.
 */
export function echeanceBilanSixAns(
  dateEntree: IsoDate | null,
  dernierBilan: IsoDate | null,
): IsoDate | null {
  if (!dateEntree) {
    return dernierBilan ? ajouterMois(dernierBilan, PERIODICITE_BILAN_MOIS) : null;
  }
  // Borne de sécurité : 20 cycles = 120 ans d'ancienneté.
  for (let k = 1; k <= 20; k++) {
    const echeance = ajouterMois(dateEntree, PERIODICITE_BILAN_MOIS * k);
    const debutFenetre = ajouterMois(echeance, -PERIODICITE_ENTRETIEN_PRO_MOIS);
    if (!dernierBilan || debutFenetre > dernierBilan) return echeance;
  }
  return null;
}

/**
 * Statut d'une échéance au jour `today` : dépassée → « en retard » ; dans les
 * `seuilJours` prochains jours (ou inconnue) → « à planifier » ; sinon « à jour ».
 */
export function statutEcheance(
  echeance: IsoDate | null,
  today: IsoDate,
  seuilJours: number = SEUIL_A_PLANIFIER_JOURS,
): StatutEcheanceEntretien {
  if (!echeance) return 'a_planifier';
  if (echeance < today) return 'en_retard';
  return differenceJours(today, echeance) <= seuilJours ? 'a_planifier' : 'a_jour';
}

export type EntretienPourSuivi = {
  id: string;
  typeEntretien: TypeEntretien;
  statut: StatutEntretien;
  datePrevue: IsoDate | null;
  dateRealisation: IsoDate | null;
};

export type SuiviEntretienPro = {
  dateEntree: IsoDate | null;
  /** Date du dernier entretien professionnel réalisé (ou signé). */
  dernierEntretien: IsoDate | null;
  dernierEntretienId: string | null;
  prochaineEcheance: IsoDate | null;
  /** Jours restants avant l'échéance (négatif = dépassée), `null` si inconnue. */
  joursRestants: number | null;
  statut: StatutEcheanceEntretien;
  /** Date du dernier état des lieux récapitulatif réalisé. */
  dernierBilan: IsoDate | null;
  echeanceBilan: IsoDate | null;
  statutBilan: StatutEcheanceEntretien | null;
  /** Prochain entretien professionnel déjà créé mais pas encore tenu. */
  entretienPlanifie: {
    id: string;
    typeEntretien: TypeEntretien;
    datePrevue: IsoDate | null;
  } | null;
};

function plusRecent(a: IsoDate | null, b: IsoDate | null): IsoDate | null {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}

/**
 * Situation d'un salarié au regard de l'obligation d'entretien professionnel,
 * à partir de sa date d'entrée et de ses entretiens (tous types confondus :
 * seuls les entretiens professionnels / bilans sont pris en compte).
 */
export function calculerSuiviEntretienPro(
  params: { dateEntree: IsoDate | null; entretiens: readonly EntretienPourSuivi[] },
  today: IsoDate,
  seuilJours: number = SEUIL_A_PLANIFIER_JOURS,
): SuiviEntretienPro {
  const professionnels = params.entretiens.filter((e) =>
    estEntretienProfessionnel(e.typeEntretien),
  );

  let dernierEntretien: IsoDate | null = null;
  let dernierEntretienId: string | null = null;
  let dernierBilan: IsoDate | null = null;
  for (const e of professionnels) {
    if (!estEntretienRealise(e.statut) || !e.dateRealisation) continue;
    if (!dernierEntretien || e.dateRealisation > dernierEntretien) {
      dernierEntretien = e.dateRealisation;
      dernierEntretienId = e.id;
    }
    if (e.typeEntretien === 'bilan_6_ans')
      dernierBilan = plusRecent(dernierBilan, e.dateRealisation);
  }

  const aVenir = professionnels
    .filter((e) => STATUTS_ENTRETIEN_A_VENIR.includes(e.statut))
    .sort((a, b) => {
      if (a.datePrevue === b.datePrevue) return 0;
      if (!a.datePrevue) return 1;
      if (!b.datePrevue) return -1;
      return a.datePrevue.localeCompare(b.datePrevue);
    });
  const premier = aVenir[0];

  const prochaineEcheance = prochainEntretienProfessionnel(dernierEntretien, params.dateEntree);
  const echeanceBilan = echeanceBilanSixAns(params.dateEntree, dernierBilan);

  return {
    dateEntree: params.dateEntree,
    dernierEntretien,
    dernierEntretienId,
    prochaineEcheance,
    joursRestants: prochaineEcheance ? differenceJours(today, prochaineEcheance) : null,
    statut: statutEcheance(prochaineEcheance, today, seuilJours),
    dernierBilan,
    echeanceBilan,
    statutBilan: echeanceBilan ? statutEcheance(echeanceBilan, today, seuilJours) : null,
    entretienPlanifie: premier
      ? { id: premier.id, typeEntretien: premier.typeEntretien, datePrevue: premier.datePrevue }
      : null,
  };
}
