/**
 * Indicateurs des absences (tableau de bord, en-tête de la liste des demandes)
 * — calcul PUR à partir des absences déjà chargées. Testé par
 * tests/unit/lib/test-sirh/absences/kpi.test.ts.
 */

import type {
  CategorieAbsence,
  StatutDemande,
  UniteDecompte,
} from '@/lib/validation/test-sirh/enums';

import { dernierJourDuMois, premierJourDuMois, type IsoDate } from '../calendrier';

import type { PlageAbsence } from './regles';
import { dureeDansPeriode } from './soldes';

export type AbsenceKpi = PlageAbsence & {
  employeId: string;
  statut: StatutDemande;
  duree: number | string;
  unite: UniteDecompte;
  categorie: CategorieAbsence;
  necessiteValidation: boolean;
};

export type KpiAbsences = {
  /** Demandes en attente de validation (toutes dates). */
  enAttente: number;
  /** Employés distincts absents aujourd'hui (absence approuvée, demi-journée comprise). */
  absentsAujourdhui: number;
  /**
   * Jours posés sur le mois en cours : absences approuvées des types SOUMIS À
   * VALIDATION (congés, RTT, événements familiaux…) décomptées en jours, partie
   * comprise dans le mois. Les arrêts déclarés (maladie, AT…) et les absences
   * en heures sont exclus.
   */
  joursPosesMois: number;
  /** Arrêts maladie / accident (catégorie « maladie ») approuvés couvrant aujourd'hui. */
  arretsMaladieEnCours: number;
};

export function calculerKpiAbsences(p: {
  absences: readonly AbsenceKpi[];
  enAttente: number;
  today: IsoDate;
  /** Fériés chômés applicables à l'employé (décompte des absences à cheval sur deux mois). */
  feriesEmploye?: (employeId: string) => Iterable<IsoDate>;
}): KpiAbsences {
  const annee = Number(p.today.slice(0, 4));
  const mois = Number(p.today.slice(5, 7));
  const periode = { debut: premierJourDuMois(annee, mois), fin: dernierJourDuMois(annee, mois) };

  const approuvees = p.absences.filter((a) => a.statut === 'approuvee');
  const couvrentAujourdhui = approuvees.filter(
    (a) => a.dateDebut <= p.today && p.today <= a.dateFin,
  );

  let joursPosesMois = 0;
  for (const a of approuvees) {
    if (!a.necessiteValidation || a.unite === 'heures') continue;
    joursPosesMois += dureeDansPeriode(a, periode, a.unite, p.feriesEmploye?.(a.employeId) ?? []);
  }

  return {
    enAttente: p.enAttente,
    absentsAujourdhui: new Set(couvrentAujourdhui.map((a) => a.employeId)).size,
    joursPosesMois: Math.round(joursPosesMois * 100) / 100,
    arretsMaladieEnCours: couvrentAujourdhui.filter((a) => a.categorie === 'maladie').length,
  };
}
