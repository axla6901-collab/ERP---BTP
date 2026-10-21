/**
 * Planning mensuel d'équipe des absences — construction PURE de la grille
 * (lignes = employés, colonnes = jours du mois). Rendu identique serveur /
 * client, aucune I/O. Testé par tests/unit/lib/test-sirh/absences/calendrier-equipe.test.ts.
 *
 * Règles d'affichage :
 * - une cellule porte deux demi-journées (matin / après-midi), chacune pouvant
 *   être occupée par une absence (demi-journée = demi-cellule) ;
 * - une absence n'est peinte que les jours qu'elle DÉCOMPTE dans l'unité de son
 *   type (`jourDecompte`) : pas de couleur sur le dimanche d'un congé en jours
 *   ouvrables, ni sur un férié chômé ; un arrêt en jours calendaires couvre le
 *   week-end. L'unité « heures » s'affiche comme des jours ouvrés ;
 * - en cas de conflit (données historiques), l'absence approuvée l'emporte.
 */

import type { StatutDemande, UniteDecompte } from '@/lib/validation/test-sirh/enums';

import {
  dernierJourDuMois,
  enumererJours,
  jourDecompte,
  jourSemaine,
  premierJourDuMois,
  type IsoDate,
} from '../calendrier';

import { couvertureJour, type PlageAbsence } from './regles';

export type TypeCalendrier = {
  id: string;
  code: string;
  libelle: string;
  couleur: string;
  uniteDecompte: UniteDecompte;
};

export type EmployeCalendrier = { id: string; label: string; siteId: string | null };

export type AbsenceCalendrier = PlageAbsence & {
  id: string;
  employeId: string;
  typeAbsenceId: string;
  statut: StatutDemande;
};

/** Jour férié CHÔMÉ (`siteId` NULL = tous les sites). */
export type FerieCalendrier = { date: IsoDate; libelle: string; siteId: string | null };

export type SegmentCalendrier = { absenceId: string; typeAbsenceId: string; statut: StatutDemande };

export type CelluleCalendrier = {
  date: IsoDate;
  weekEnd: boolean;
  /** Libellé du férié chômé applicable à l'employé (global ou de son site). */
  ferie: string | null;
  matin: SegmentCalendrier | null;
  apresMidi: SegmentCalendrier | null;
};

export type JourCalendrier = {
  date: IsoDate;
  numero: number;
  /** Initiale du jour : L M M J V S D. */
  initiale: string;
  weekEnd: boolean;
  /** Férié chômé commun à tous les sites. */
  ferie: string | null;
  aujourdhui: boolean;
};

export type LigneCalendrier = {
  employe: EmployeCalendrier;
  cellules: CelluleCalendrier[];
  /** Nombre de demi-journées d'absence affichées sur le mois. */
  demiJourneesAbsence: number;
};

export type GrilleMois = {
  annee: number;
  mois: number;
  jours: JourCalendrier[];
  lignes: LigneCalendrier[];
};

/** Initiales des jours, index 0 = dimanche (comme `jourSemaine`). */
export const INITIALES_JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const;

/** Clé de mois `YYYY-MM` (paramètre d'URL `?mois=`). */
export function cleMois(annee: number, mois: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}`;
}

/** Mois décalé de `delta` mois (navigation ← →). */
export function moisVoisin(
  annee: number,
  mois: number,
  delta: number,
): { annee: number; mois: number } {
  const index = annee * 12 + (mois - 1) + delta;
  return { annee: Math.floor(index / 12), mois: (index % 12) + 1 };
}

function estWeekEnd(iso: IsoDate): boolean {
  const j = jourSemaine(iso);
  return j === 0 || j === 6;
}

const PRIORITE_STATUT: Partial<Record<StatutDemande, number>> = { approuvee: 0, en_attente: 1 };

export function construireGrilleMois(p: {
  annee: number;
  mois: number;
  employes: readonly EmployeCalendrier[];
  absences: readonly AbsenceCalendrier[];
  feries: readonly FerieCalendrier[];
  types: readonly TypeCalendrier[];
  today: IsoDate;
}): GrilleMois {
  const dates = enumererJours(
    premierJourDuMois(p.annee, p.mois),
    dernierJourDuMois(p.annee, p.mois),
  );
  const feriesGlobaux = new Map(
    p.feries.filter((f) => f.siteId === null).map((f) => [f.date, f.libelle]),
  );
  const jours: JourCalendrier[] = dates.map((date) => ({
    date,
    numero: Number(date.slice(8, 10)),
    initiale: INITIALES_JOURS[jourSemaine(date)] ?? '',
    weekEnd: estWeekEnd(date),
    ferie: feriesGlobaux.get(date) ?? null,
    aujourdhui: date === p.today,
  }));

  const typesParId = new Map(p.types.map((t) => [t.id, t]));
  const absencesParEmploye = new Map<string, AbsenceCalendrier[]>();
  for (const a of p.absences) {
    const liste = absencesParEmploye.get(a.employeId) ?? [];
    liste.push(a);
    absencesParEmploye.set(a.employeId, liste);
  }

  const lignes: LigneCalendrier[] = p.employes.map((employe) => {
    const feriesEmploye = new Map(
      p.feries
        .filter((f) => f.siteId === null || f.siteId === employe.siteId)
        .map((f) => [f.date, f.libelle]),
    );
    const datesFeries = new Set(feriesEmploye.keys());
    const cellules: CelluleCalendrier[] = dates.map((date) => ({
      date,
      weekEnd: estWeekEnd(date),
      ferie: feriesEmploye.get(date) ?? null,
      matin: null,
      apresMidi: null,
    }));

    const absences = [...(absencesParEmploye.get(employe.id) ?? [])].sort(
      (a, b) =>
        (PRIORITE_STATUT[a.statut] ?? 9) - (PRIORITE_STATUT[b.statut] ?? 9) ||
        a.dateDebut.localeCompare(b.dateDebut),
    );
    for (const absence of absences) {
      const unite = typesParId.get(absence.typeAbsenceId)?.uniteDecompte ?? 'jours_ouvres';
      const uniteAffichage = unite === 'heures' ? 'jours_ouvres' : unite;
      const segment: SegmentCalendrier = {
        absenceId: absence.id,
        typeAbsenceId: absence.typeAbsenceId,
        statut: absence.statut,
      };
      for (const cellule of cellules) {
        if (cellule.date < absence.dateDebut || cellule.date > absence.dateFin) continue;
        if (!jourDecompte(cellule.date, uniteAffichage, datesFeries)) continue;
        const couverture = couvertureJour(absence, cellule.date);
        if (couverture.matin && !cellule.matin) cellule.matin = segment;
        if (couverture.apresMidi && !cellule.apresMidi) cellule.apresMidi = segment;
      }
    }

    const demiJourneesAbsence = cellules.reduce(
      (n, c) => n + (c.matin ? 1 : 0) + (c.apresMidi ? 1 : 0),
      0,
    );
    return { employe, cellules, demiJourneesAbsence };
  });

  return { annee: p.annee, mois: p.mois, jours, lignes };
}

// ─────────────────────────────────────────────────────────────
// Forme compacte (passage au composant client)
// ─────────────────────────────────────────────────────────────

/** Ligne de grille compacte : seules les cellules qui s'écartent du jour « nu »
 *  (`jours[i]` : week-end, férié global) sont transmises. */
export type LigneCalendrierCompacte = {
  employe: EmployeCalendrier;
  demiJourneesAbsence: number;
  /** `[index du jour, segment matin, segment après-midi]` — index dans `segments`, -1 = libre. */
  absences: Array<[number, number, number]>;
  /** `[index du jour, libellé]` : férié propre au site, différent du férié global du jour. */
  feries: Array<[number, string | null]>;
};

export type GrilleCompacte = {
  annee: number;
  mois: number;
  jours: JourCalendrier[];
  /** Segments dédoublonnés, référencés par index depuis `lignes[].absences`. */
  segments: SegmentCalendrier[];
  lignes: LigneCalendrierCompacte[];
};

/**
 * Compacte la grille pour la passer à un composant client. Rendue en composant
 * serveur, chaque cellule (≈ 4 000 pour 130 salariés × 31 jours) était un
 * élément sérialisé dans la charge utile RSC : 3,3 Mo mesurés en développement.
 * Ici, seules les cellules porteuses (absence, férié de site) sont transmises ;
 * `decompacterCellules` reconstruit exactement les cellules d'origine.
 */
export function compacterGrille(g: GrilleMois): GrilleCompacte {
  const segments: SegmentCalendrier[] = [];
  const indexSegment = new Map<string, number>();
  const indexDe = (s: SegmentCalendrier | null): number => {
    if (!s) return -1;
    const cle = `${s.absenceId}|${s.typeAbsenceId}|${s.statut}`;
    let i = indexSegment.get(cle);
    if (i === undefined) {
      i = segments.length;
      segments.push(s);
      indexSegment.set(cle, i);
    }
    return i;
  };

  const lignes = g.lignes.map((ligne): LigneCalendrierCompacte => {
    const absences: Array<[number, number, number]> = [];
    const feries: Array<[number, string | null]> = [];
    ligne.cellules.forEach((c, j) => {
      if (c.matin || c.apresMidi) absences.push([j, indexDe(c.matin), indexDe(c.apresMidi)]);
      if (c.ferie !== (g.jours[j]?.ferie ?? null)) feries.push([j, c.ferie]);
    });
    return {
      employe: ligne.employe,
      demiJourneesAbsence: ligne.demiJourneesAbsence,
      absences,
      feries,
    };
  });

  return { annee: g.annee, mois: g.mois, jours: g.jours, segments, lignes };
}

/** Reconstruit les cellules d'une ligne compacte (inverse de `compacterGrille`). */
export function decompacterCellules(
  jours: readonly JourCalendrier[],
  segments: readonly SegmentCalendrier[],
  ligne: LigneCalendrierCompacte,
): CelluleCalendrier[] {
  const cellules: CelluleCalendrier[] = jours.map((j) => ({
    date: j.date,
    weekEnd: j.weekEnd,
    ferie: j.ferie,
    matin: null,
    apresMidi: null,
  }));
  for (const [j, ferie] of ligne.feries) {
    const c = cellules[j];
    if (c) c.ferie = ferie;
  }
  for (const [j, matin, apresMidi] of ligne.absences) {
    const c = cellules[j];
    if (!c) continue;
    c.matin = matin >= 0 ? (segments[matin] ?? null) : null;
    c.apresMidi = apresMidi >= 0 ? (segments[apresMidi] ?? null) : null;
  }
  return cellules;
}
