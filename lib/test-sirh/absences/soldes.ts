/**
 * Soldes des compteurs d'absence — fonctions PURES (Factorial AllowanceStat).
 *
 * solde = droits acquis + report + Σ ajustements − pris (absences approuvées)
 * solde prévisionnel = solde − demandes en attente
 *
 * Une absence est rattachée au compteur dont la période la contient ; une
 * absence à cheval sur deux périodes est ventilée jour par jour (unités en
 * jours) ou rattachée à la période de sa date de début (unité « heures »).
 * Testé par tests/unit/lib/test-sirh/absences/soldes.test.ts.
 */

import type { UniteDecompte } from '@/lib/validation/test-sirh/enums';

import { chevauchement, compterJoursAbsence, type IsoDate } from '../calendrier';
import { formatHeures, formatJours, versNombre } from '../format';

import type { PlageAbsence } from './regles';

/** Arrondi au centième (évite les 0,1 + 0,2 = 0,30000000000000004). */
function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}

function nombre(v: number | string | null | undefined): number {
  return versNombre(v) ?? 0;
}

export type SyntheseSolde = {
  droitsAcquis: number;
  report: number;
  /** Σ des ajustements signés. */
  totalAjustements: number;
  /** Absences approuvées décomptées sur la période. */
  pris: number;
  /** Demandes en attente décomptées sur la période. */
  enAttente: number;
  /** droits + report + ajustements − pris. */
  solde: number;
  /** solde − en attente (ce qui restera si tout est approuvé). */
  soldePrevisionnel: number;
};

export function calculerSolde(p: {
  droitsAcquis: number | string;
  report: number | string;
  ajustements: ReadonlyArray<number | string>;
  pris: number;
  enAttente?: number;
}): SyntheseSolde {
  const droitsAcquis = arrondir(nombre(p.droitsAcquis));
  const report = arrondir(nombre(p.report));
  const totalAjustements = arrondir(p.ajustements.reduce<number>((s, v) => s + nombre(v), 0));
  const pris = arrondir(p.pris);
  const enAttente = arrondir(p.enAttente ?? 0);
  const solde = arrondir(droitsAcquis + report + totalAjustements - pris);
  return {
    droitsAcquis,
    report,
    totalAjustements,
    pris,
    enAttente,
    solde,
    soldePrevisionnel: arrondir(solde - enAttente),
  };
}

/**
 * Part d'une absence décomptée dans la période [debut, fin] :
 * - absence entièrement incluse → sa durée enregistrée ;
 * - unité « heures » → durée entière si la date de début est dans la période ;
 * - sinon → recalcul du décompte sur la partie incluse (demi-journées et règle
 *   du samedi final conservées uniquement aux bornes d'origine).
 */
export function dureeDansPeriode(
  absence: PlageAbsence & { duree: number | string },
  periode: { debut: IsoDate; fin: IsoDate },
  unite: UniteDecompte,
  feries: Iterable<IsoDate> = [],
): number {
  if (!chevauchement(absence.dateDebut, absence.dateFin, periode.debut, periode.fin)) return 0;
  const duree = nombre(absence.duree);
  if (absence.dateDebut >= periode.debut && absence.dateFin <= periode.fin) return duree;
  if (unite === 'heures') {
    return absence.dateDebut >= periode.debut && absence.dateDebut <= periode.fin ? duree : 0;
  }
  const debut = absence.dateDebut > periode.debut ? absence.dateDebut : periode.debut;
  const fin = absence.dateFin < periode.fin ? absence.dateFin : periode.fin;
  return compterJoursAbsence({
    dateDebut: debut,
    dateFin: fin,
    demiJourneeDebut: debut === absence.dateDebut && absence.demiJourneeDebut,
    demiJourneeFin: fin === absence.dateFin && absence.demiJourneeFin,
    unite,
    feries,
    samediFinal: fin === absence.dateFin,
  });
}

export type CompteurPeriode = {
  employeId: string;
  typeAbsenceId: string;
  periodeDebut: IsoDate;
  periodeFin: IsoDate;
};

/** Compteur de l'employé pour ce type dont la période contient `date`, ou `null`. */
export function trouverCompteurApplicable<T extends CompteurPeriode>(
  compteurs: readonly T[],
  cible: { employeId: string; typeAbsenceId: string; date: IsoDate },
): T | null {
  return (
    compteurs.find(
      (c) =>
        c.employeId === cible.employeId &&
        c.typeAbsenceId === cible.typeAbsenceId &&
        c.periodeDebut <= cible.date &&
        cible.date <= c.periodeFin,
    ) ?? null
  );
}

/** Durée lisible selon l'unité du type : `2,5 j` ou `7 h 30`. */
export function formatDuree(
  valeur: number | string | null | undefined,
  unite: UniteDecompte,
): string {
  return unite === 'heures' ? formatHeures(valeur) : formatJours(valeur);
}

/**
 * Avertissement NON bloquant si la durée demandée dépasse le solde disponible
 * (solde prévisionnel : demandes en attente déduites), sinon `null`.
 */
export function messageSoldeInsuffisant(
  disponible: number,
  demande: number,
  unite: UniteDecompte,
): string | null {
  if (demande <= disponible + 1e-9) return null;
  return (
    `Solde insuffisant : ${formatDuree(disponible, unite)} disponible(s) ` +
    `(demandes en attente déduites) pour ${formatDuree(demande, unite)} demandé(s).`
  );
}

/**
 * Droits annuels proposés par défaut à l'initialisation des compteurs :
 * congés payés = 30 jours ouvrables (2,5 j × 12 mois), soit 25 jours ouvrés ;
 * autres types : 0 (à saisir).
 */
export function droitsParDefaut(type: { code: string; uniteDecompte: UniteDecompte }): number {
  if (type.code.toUpperCase() !== 'CP') return 0;
  if (type.uniteDecompte === 'jours_ouvrables') return 30;
  if (type.uniteDecompte === 'jours_ouvres') return 25;
  return 0;
}
