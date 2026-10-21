/**
 * Heures supplémentaires — logique PURE (aucune I/O), importable côté client
 * comme serveur. Équivalent fonctionnel de Factorial `attendance/OvertimeRequest`
 * (+ `Review` pour la décision) : libellés de majoration, totaux du mois et règles
 * du workflow `en_attente → approuvee | refusee`, `annulee`.
 */

import { formatDateFr, formatHeures, versNombre } from '../format';
import {
  MAJORATIONS_HS,
  type CompensationHs,
  type StatutDemande,
} from '@/lib/validation/test-sirh/enums';

/** `25` → `+25 %` ; `0` → `Sans majoration`. */
export function libelleMajoration(pct: number): string {
  return pct === 0 ? 'Sans majoration' : `+${pct} %`;
}

/** Libellés courts des modes de compensation (tableaux). */
export const LIBELLES_COURTS_COMPENSATION: Record<CompensationHs, string> = {
  paiement: 'Paiement',
  recuperation: 'Récupération',
};

/** Résumé d'une demande : `Martin Paul — 12/10/2026 — 2 h 30 (+25 %)`. */
export function resumeHeuresSup(d: {
  employeNom: string;
  employePrenom: string;
  dateHeures: string;
  dureeHeures: number | string;
  majorationPct: number;
}): string {
  return `${`${d.employeNom} ${d.employePrenom}`.trim()} — ${formatDateFr(d.dateHeures)} — ${formatHeures(
    d.dureeHeures,
  )} (${libelleMajoration(d.majorationPct)})`;
}

/** Libellé de variable de paie : `Heures supplémentaires +25 %`. */
export function libelleVariableHeuresSup(pct: number): string {
  return pct === 0
    ? 'Heures supplémentaires (sans majoration)'
    : `Heures supplémentaires ${libelleMajoration(pct)}`;
}

export type HeuresSupPourTotaux = {
  statut: StatutDemande;
  majorationPct: number;
  dureeHeures: number | string;
  compensation: CompensationHs;
};

export type TotalMajoration = {
  majorationPct: number;
  /** Demandes approuvées ou en attente. */
  nb: number;
  heuresApprouvees: number;
  heuresEnAttente: number;
  /** Heures approuvées compensées en paiement (variables de paie). */
  heuresPayees: number;
  /** Heures approuvées compensées en repos. */
  heuresRecuperees: number;
};

export type TotauxHeuresSup = {
  lignes: TotalMajoration[];
  total: Omit<TotalMajoration, 'majorationPct'>;
};

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Totaux par taux de majoration (ordre de `MAJORATIONS_HS`, puis taux hors liste) ;
 * seules les demandes approuvées et en attente comptent. Les taux sans demande
 * sont omis.
 */
export function totauxParMajoration(demandes: readonly HeuresSupPourTotaux[]): TotauxHeuresSup {
  const parTaux = new Map<number, TotalMajoration>();
  for (const d of demandes) {
    if (d.statut !== 'approuvee' && d.statut !== 'en_attente') continue;
    const heures = versNombre(d.dureeHeures) ?? 0;
    const t = parTaux.get(d.majorationPct) ?? {
      majorationPct: d.majorationPct,
      nb: 0,
      heuresApprouvees: 0,
      heuresEnAttente: 0,
      heuresPayees: 0,
      heuresRecuperees: 0,
    };
    t.nb += 1;
    if (d.statut === 'approuvee') {
      t.heuresApprouvees += heures;
      if (d.compensation === 'paiement') t.heuresPayees += heures;
      else t.heuresRecuperees += heures;
    } else {
      t.heuresEnAttente += heures;
    }
    parTaux.set(d.majorationPct, t);
  }

  const ordre = (pct: number) => {
    const i = (MAJORATIONS_HS as readonly number[]).indexOf(pct);
    return i === -1 ? MAJORATIONS_HS.length + pct : i;
  };
  const lignes = [...parTaux.values()]
    .sort((a, b) => ordre(a.majorationPct) - ordre(b.majorationPct))
    .map((t) => ({
      ...t,
      heuresApprouvees: arrondi2(t.heuresApprouvees),
      heuresEnAttente: arrondi2(t.heuresEnAttente),
      heuresPayees: arrondi2(t.heuresPayees),
      heuresRecuperees: arrondi2(t.heuresRecuperees),
    }));

  const total = lignes.reduce<Omit<TotalMajoration, 'majorationPct'>>(
    (acc, l) => ({
      nb: acc.nb + l.nb,
      heuresApprouvees: arrondi2(acc.heuresApprouvees + l.heuresApprouvees),
      heuresEnAttente: arrondi2(acc.heuresEnAttente + l.heuresEnAttente),
      heuresPayees: arrondi2(acc.heuresPayees + l.heuresPayees),
      heuresRecuperees: arrondi2(acc.heuresRecuperees + l.heuresRecuperees),
    }),
    { nb: 0, heuresApprouvees: 0, heuresEnAttente: 0, heuresPayees: 0, heuresRecuperees: 0 },
  );
  return { lignes, total };
}

/** Nombre de demandes par statut (pour les pastilles de filtre). */
export function compterParStatut(
  demandes: readonly { statut: StatutDemande }[],
): Record<StatutDemande, number> {
  const compte: Record<StatutDemande, number> = {
    brouillon: 0,
    en_attente: 0,
    approuvee: 0,
    refusee: 0,
    annulee: 0,
  };
  for (const d of demandes) compte[d.statut] += 1;
  return compte;
}

// ─────────────────────────────────────────────────────────────
// Workflow
// ─────────────────────────────────────────────────────────────

/** Seule une demande en attente peut être approuvée ou refusée. */
export function peutDeciderHeuresSup(statut: StatutDemande): boolean {
  return statut === 'en_attente';
}

/**
 * Annulation : une demande en attente (ou brouillon) par son auteur ou un
 * valideur ; une demande approuvée par un valideur uniquement (tant qu'elle
 * n'est pas intégrée à la paie — vérifié côté serveur).
 */
export function peutAnnulerHeuresSup(
  statut: StatutDemande,
  opts: { estValideur: boolean },
): boolean {
  if (statut === 'en_attente' || statut === 'brouillon') return true;
  if (statut === 'approuvee') return opts.estValideur;
  return false;
}

/** Message d'erreur si l'annulation est refusée, sinon null. */
export function motifRefusAnnulation(
  statut: StatutDemande,
  opts: { estValideur: boolean },
): string | null {
  if (peutAnnulerHeuresSup(statut, opts)) return null;
  if (statut === 'approuvee') {
    return 'Une demande approuvée ne peut être annulée que par un valideur.';
  }
  return 'Cette demande ne peut plus être annulée.';
}
