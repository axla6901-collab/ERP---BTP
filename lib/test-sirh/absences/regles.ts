/**
 * Règles métier PURES des absences (Test SIRH › Absences) : chevauchement à la
 * demi-journée, périodes bloquées, machine à états des demandes, droits de
 * décision / d'annulation, calcul de la durée d'une demande.
 *
 * Aucune I/O : importable côté client (dialogue de demande, listes) comme
 * serveur (server actions). Testé par tests/unit/lib/test-sirh/absences/regles.test.ts.
 */

import {
  LIBELLES_STATUT_DEMANDE,
  STATUTS_DEMANDE_ACTIFS,
  type StatutDemande,
  type UniteDecompte,
} from '@/lib/validation/test-sirh/enums';

import { chevauchement, compterJoursAbsence, type IsoDate } from '../calendrier';
import { formatDateFr, versNombre } from '../format';

// ─────────────────────────────────────────────────────────────
// Plages d'absence et chevauchement à la demi-journée
// ─────────────────────────────────────────────────────────────

export type PlageAbsence = {
  dateDebut: IsoDate;
  dateFin: IsoDate;
  /** L'absence commence l'après-midi de `dateDebut`. */
  demiJourneeDebut: boolean;
  /** L'absence se termine à midi le jour de `dateFin`. */
  demiJourneeFin: boolean;
};

/**
 * Bornes d'une plage en demi-journées, sous forme de clés comparables
 * lexicographiquement : `YYYY-MM-DD#0` (matin) / `YYYY-MM-DD#1` (après-midi).
 */
export function bornesDemiJournees(p: PlageAbsence): { debut: string; fin: string } {
  return {
    debut: `${p.dateDebut}#${p.demiJourneeDebut ? 1 : 0}`,
    fin: `${p.dateFin}#${p.demiJourneeFin ? 0 : 1}`,
  };
}

/**
 * Deux plages se chevauchent-elles ? Comparaison à la demi-journée : un départ
 * l'après-midi ne chevauche pas une absence qui se termine le même jour à midi.
 */
export function plagesSeChevauchent(a: PlageAbsence, b: PlageAbsence): boolean {
  const x = bornesDemiJournees(a);
  const y = bornesDemiJournees(b);
  return x.debut <= y.fin && y.debut <= x.fin;
}

/**
 * Première absence ACTIVE (`STATUTS_DEMANDE_ACTIFS` : en attente ou approuvée)
 * chevauchant la demande, ou `null`. `ignorerId` exclut l'absence elle-même.
 */
export function trouverChevauchement<
  T extends PlageAbsence & { id: string; statut: StatutDemande },
>(demande: PlageAbsence, existantes: readonly T[], ignorerId?: string): T | null {
  return (
    existantes.find(
      (e) =>
        e.id !== ignorerId &&
        STATUTS_DEMANDE_ACTIFS.includes(e.statut) &&
        plagesSeChevauchent(demande, e),
    ) ?? null
  );
}

/** Demi-journées couvertes par la plage le jour `iso` (aucune si hors plage). */
export function couvertureJour(
  p: PlageAbsence,
  iso: IsoDate,
): { matin: boolean; apresMidi: boolean } {
  if (iso < p.dateDebut || iso > p.dateFin) return { matin: false, apresMidi: false };
  return {
    matin: !(iso === p.dateDebut && p.demiJourneeDebut),
    apresMidi: !(iso === p.dateFin && p.demiJourneeFin),
  };
}

/** Libellé lisible : « le 12/10/2026 (matin) », « du 12/10/2026 (après-midi) au 16/10/2026 ». */
export function libellePlage(p: PlageAbsence): string {
  if (p.dateDebut === p.dateFin) {
    const suffixe = p.demiJourneeDebut ? ' (après-midi)' : p.demiJourneeFin ? ' (matin)' : '';
    return `le ${formatDateFr(p.dateDebut)}${suffixe}`;
  }
  const debut = `${formatDateFr(p.dateDebut)}${p.demiJourneeDebut ? ' (après-midi)' : ''}`;
  const fin = `${formatDateFr(p.dateFin)}${p.demiJourneeFin ? ' (midi)' : ''}`;
  return `du ${debut} au ${fin}`;
}

// ─────────────────────────────────────────────────────────────
// Périodes bloquées (Factorial BlockedPeriod)
// ─────────────────────────────────────────────────────────────

export type PeriodeBloqueeRegle = {
  id: string;
  libelle: string;
  dateDebut: IsoDate;
  dateFin: IsoDate;
  /** NULL = tous les types soumis à validation. */
  typeAbsenceId: string | null;
  /** NULL = toutes les équipes. */
  equipeId: string | null;
};

/**
 * Période bloquée applicable à la demande, ou `null`. Une période s'applique si
 * ses dates chevauchent la demande ET :
 * - type : la période vise ce type, ou aucun type précis — dans ce dernier cas
 *   seuls les types SOUMIS À VALIDATION sont bloqués (on ne refuse pas la
 *   déclaration d'un arrêt maladie ou d'un accident du travail) ;
 * - équipe : la période vise une équipe de l'employé, ou toutes les équipes.
 */
export function periodeBloqueeApplicable<T extends PeriodeBloqueeRegle>(
  demande: {
    dateDebut: IsoDate;
    dateFin: IsoDate;
    typeAbsenceId: string;
    necessiteValidation: boolean;
  },
  equipesEmploye: readonly string[],
  periodes: readonly T[],
): T | null {
  return (
    periodes.find((p) => {
      if (!chevauchement(p.dateDebut, p.dateFin, demande.dateDebut, demande.dateFin)) return false;
      const typeVise =
        p.typeAbsenceId === null
          ? demande.necessiteValidation
          : p.typeAbsenceId === demande.typeAbsenceId;
      const equipeVisee = p.equipeId === null || equipesEmploye.includes(p.equipeId);
      return typeVise && equipeVisee;
    }) ?? null
  );
}

// ─────────────────────────────────────────────────────────────
// Machine à états des demandes
// ─────────────────────────────────────────────────────────────

/** Transitions autorisées du statut d'une demande d'absence. */
export const TRANSITIONS_STATUT_DEMANDE: Readonly<Record<StatutDemande, readonly StatutDemande[]>> =
  {
    brouillon: ['en_attente', 'annulee'],
    en_attente: ['approuvee', 'refusee', 'annulee'],
    approuvee: ['annulee'],
    refusee: [],
    annulee: [],
  };

export function transitionAutorisee(de: StatutDemande, vers: StatutDemande): boolean {
  return TRANSITIONS_STATUT_DEMANDE[de].includes(vers);
}

/**
 * Statut à la création : approuvée d'office si le type ne demande pas de
 * validation, ou si un gestionnaire RH demande l'approbation directe.
 */
export function statutInitialDemande(p: {
  necessiteValidation: boolean;
  approuverDirectement: boolean;
  estGestionnaire: boolean;
}): 'en_attente' | 'approuvee' {
  if (!p.necessiteValidation) return 'approuvee';
  if (p.approuverDirectement && p.estGestionnaire) return 'approuvee';
  return 'en_attente';
}

export type Verdict = { ok: true } | { ok: false; raison: string };

/**
 * Un valideur peut-il décider (approuver / refuser) la demande ?
 * - seule une demande en attente se décide ;
 * - un valideur ne décide pas sa propre demande, sauf gestionnaire RH (admin / RH).
 */
export function verifierDecision(p: {
  statut: StatutDemande;
  estPropreDemande: boolean;
  estGestionnaire: boolean;
}): Verdict {
  if (!transitionAutorisee(p.statut, 'approuvee')) {
    const raison =
      p.statut === 'approuvee'
        ? 'Cette demande est déjà approuvée.'
        : p.statut === 'refusee'
          ? 'Cette demande a déjà été refusée.'
          : p.statut === 'annulee'
            ? 'Cette demande a été annulée.'
            : 'Cette demande n’est pas en attente de validation.';
    return { ok: false, raison };
  }
  if (p.estPropreDemande && !p.estGestionnaire) {
    return { ok: false, raison: 'Vous ne pouvez pas valider votre propre demande.' };
  }
  return { ok: true };
}

/**
 * La demande peut-elle être annulée par l'utilisateur ?
 * - gestion RH : toujours (tant que le statut le permet) ;
 * - demandeur : si la demande est en attente, ou approuvée et pas encore commencée.
 */
export function verifierAnnulation(p: {
  statut: StatutDemande;
  dateDebut: IsoDate;
  today: IsoDate;
  estGestionnaire: boolean;
  estDemandeur: boolean;
}): Verdict {
  if (!transitionAutorisee(p.statut, 'annulee')) {
    return {
      ok: false,
      raison: `Cette demande ne peut plus être annulée (statut : ${LIBELLES_STATUT_DEMANDE[p.statut].toLowerCase()}).`,
    };
  }
  if (p.estGestionnaire) return { ok: true };
  if (!p.estDemandeur) {
    return {
      ok: false,
      raison: 'Seul le demandeur ou un gestionnaire RH peut annuler cette demande.',
    };
  }
  if (p.statut === 'approuvee' && p.dateDebut <= p.today) {
    return {
      ok: false,
      raison: 'Absence déjà commencée : seule la gestion RH peut l’annuler.',
    };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Durée d'une demande
// ─────────────────────────────────────────────────────────────

/** Jour férié chômé, global (`siteId` NULL) ou propre à un site. */
export type FerieSite = { date: IsoDate; siteId: string | null };

/** Dates des fériés chômés applicables à un employé du site `siteId` (globaux + site). */
export function datesFeriesApplicables(
  feries: readonly FerieSite[],
  siteId: string | null,
): IsoDate[] {
  return feries.filter((f) => f.siteId === null || f.siteId === siteId).map((f) => f.date);
}

/**
 * Durée décomptée d'une demande, dans l'unité du type : jours (ouvrables,
 * ouvrés, calendaires — pas de 0,5, fériés chômés exclus) via
 * `compterJoursAbsence`, ou heures saisies (unité « heures »). `null` si la
 * durée en heures n'est pas (correctement) saisie.
 */
export function calculerDureeDemande(
  p: PlageAbsence & {
    unite: UniteDecompte;
    feries: Iterable<IsoDate>;
    dureeHeures?: number | string | null;
  },
): number | null {
  if (p.unite === 'heures') {
    const n = versNombre(p.dureeHeures);
    return n !== null && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  return compterJoursAbsence({
    dateDebut: p.dateDebut,
    dateFin: p.dateFin,
    demiJourneeDebut: p.demiJourneeDebut,
    demiJourneeFin: p.demiJourneeFin,
    unite: p.unite,
    feries: p.feries,
  });
}
