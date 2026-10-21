/**
 * Feuille de temps hebdomadaire — logique PURE (aucune I/O), importable côté
 * client comme serveur. Équivalent fonctionnel de Factorial `attendance/Shift` +
 * `attendance/WorkedTime` : agrège les badgeages par collaborateur et par jour,
 * les compare au temps théorique de l'horaire (`work_schedule`) et calcule les
 * écarts.
 *
 * Règles :
 * - minutes travaillées d'un badgeage = fin − début − pause (`dureeTravailMinutes`,
 *   poste de nuit si fin < début) ; un badgeage sans heure de fin est « en cours »
 *   et ne compte pas (durée inconnue) ;
 * - théorique du jour = heures de l'horaire pour ce jour de semaine, 0 si férié
 *   chômé (global ou du site du collaborateur), réduit au prorata d'une absence
 *   approuvée (journée = 0, demi-journée = moitié) ;
 * - pas d'horaire applicable → théorique et écart `null` (non calculables).
 */

import {
  ajouterJours,
  differenceJours,
  dureeTravailMinutes,
  enumererJours,
  estDateIso,
  heuresTheoriquesJour,
  jourSemaine,
  lundiDeLaSemaine,
  minutesDepuisMinuit,
  type HoraireSemaine,
  type IsoDate,
} from '../calendrier';
import { formatDateFr } from '../format';
import type { LieuTravail, SourceBadgeage } from '@/lib/validation/test-sirh/enums';

// ─────────────────────────────────────────────────────────────
// Types d'entrée (lignes déjà lues et nettoyées par la couche serveur)
// ─────────────────────────────────────────────────────────────

export type BadgeageSource = {
  id: string;
  employeId: string;
  dateBadgeage: IsoDate;
  /** `HH:MM` ou `HH:MM:SS`. */
  heureDebut: string;
  /** `null` = badgeage en cours. */
  heureFin: string | null;
  pauseMinutes: number;
  lieu: LieuTravail;
  chantierId: string | null;
  chantierLabel: string | null;
  source: SourceBadgeage;
  valide: boolean;
  commentaire: string | null;
};

export type EmployeFeuille = {
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
  /** Horaire applicable (celui du collaborateur, sinon l'horaire par défaut) ; null = aucun. */
  horaire: HoraireSemaine | null;
  horaireNom: string | null;
  /** Site de rattachement (fériés propres au site). */
  siteId: string | null;
};

export type AbsenceSource = {
  employeId: string;
  dateDebut: IsoDate;
  dateFin: IsoDate;
  demiJourneeDebut: boolean;
  demiJourneeFin: boolean;
  libelle: string;
  code: string;
  couleur: string;
};

/** Jour férié CHÔMÉ (`siteId` null = tous les sites). */
export type FerieSource = { date: IsoDate; libelle: string; siteId: string | null };

// ─────────────────────────────────────────────────────────────
// Types de sortie (sérialisables)
// ─────────────────────────────────────────────────────────────

export type BadgeageCalcule = BadgeageSource & {
  /** Minutes travaillées (pause déduite) ; null = en cours. */
  minutes: number | null;
  enCours: boolean;
};

export type AbsenceJour = {
  libelle: string;
  code: string;
  couleur: string;
  /** Part de la journée absente : 1 = journée entière, 0,5 = demi-journée. */
  fraction: number;
};

export type JourFeuille = {
  date: IsoDate;
  badgeages: BadgeageCalcule[];
  minutesTravaillees: number;
  /** null = aucun horaire applicable. */
  minutesTheoriques: number | null;
  ecartMinutes: number | null;
  /** Libellé du férié chômé, sinon null. */
  ferie: string | null;
  absences: AbsenceJour[];
  enCours: boolean;
};

export type LigneFeuille = {
  employe: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string | null;
    horaireNom: string | null;
  };
  jours: JourFeuille[];
  minutesTravaillees: number;
  minutesTheoriques: number | null;
  ecartMinutes: number | null;
  nbBadgeages: number;
  /** Badgeages terminés non encore validés. */
  nbNonValides: number;
  nbEnCours: number;
  /** Au moins un badgeage terminé, et tous les badgeages terminés sont validés. */
  semaineValidee: boolean;
};

export type TotauxFeuille = {
  nbEmployes: number;
  minutesTravaillees: number;
  minutesTheoriques: number;
  ecartMinutes: number;
  nbBadgeages: number;
  nbNonValides: number;
  nbEnCours: number;
};

export type FeuilleTemps = {
  lundi: IsoDate;
  dimanche: IsoDate;
  jours: IsoDate[];
  lignes: LigneFeuille[];
  totaux: TotauxFeuille;
};

// ─────────────────────────────────────────────────────────────
// Semaines
// ─────────────────────────────────────────────────────────────

/** Le jour ISO est-il un lundi ? */
export function estLundi(iso: string | null | undefined): boolean {
  return estDateIso(iso) && jourSemaine(iso) === 1;
}

/**
 * Lundi de la semaine demandée par le paramètre d'URL `?semaine=` (n'importe quel
 * jour de la semaine est accepté) ; absent ou invalide → semaine de `aujourdhui`.
 */
export function semaineDepuisParametre(
  param: string | null | undefined,
  aujourdhui: IsoDate,
): IsoDate {
  return lundiDeLaSemaine(estDateIso(param) ? param : aujourdhui);
}

/** Les 7 jours (lundi → dimanche) de la semaine commençant à `lundi`. */
export function joursDeLaSemaine(lundi: IsoDate): IsoDate[] {
  return enumererJours(lundi, ajouterJours(lundi, 6));
}

/** Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année). */
export function numeroSemaineIso(iso: IsoDate): number {
  const j = jourSemaine(iso) || 7; // dimanche = 7
  const jeudi = ajouterJours(iso, 4 - j);
  const debutAnnee = `${jeudi.slice(0, 4)}-01-01`;
  return Math.floor(differenceJours(debutAnnee, jeudi) / 7) + 1;
}

/** URL de la feuille de temps pour une semaine et des filtres (`?semaine=&equipe=&site=`). */
export function urlFeuilleTemps(
  chemin: string,
  p: { semaine: IsoDate; equipeId?: string | null; siteId?: string | null },
): string {
  const params = new URLSearchParams({ semaine: p.semaine });
  if (p.equipeId) params.set('equipe', p.equipeId);
  if (p.siteId) params.set('site', p.siteId);
  return `${chemin}?${params.toString()}`;
}

/** `Semaine 42 · du 12/10/2026 au 18/10/2026`. */
export function libelleSemaine(lundi: IsoDate): string {
  return `Semaine ${numeroSemaineIso(lundi)} · du ${formatDateFr(lundi)} au ${formatDateFr(
    ajouterJours(lundi, 6),
  )}`;
}

// ─────────────────────────────────────────────────────────────
// Badgeages
// ─────────────────────────────────────────────────────────────

/** Minutes travaillées d'un badgeage (pause déduite), null si en cours / invalide. */
export function minutesBadgeage(b: {
  heureDebut: string;
  heureFin: string | null;
  pauseMinutes: number;
}): number | null {
  return dureeTravailMinutes(b.heureDebut, b.heureFin, b.pauseMinutes);
}

/**
 * Amplitude brute d'un badgeage en minutes (pause non déduite), poste de nuit
 * pris en compte. null si une heure est invalide ou absente.
 */
export function amplitudeMinutes(heureDebut: string, heureFin: string | null): number | null {
  return dureeTravailMinutes(heureDebut, heureFin, 0);
}

/** Intervalle [début, fin[ en minutes depuis minuit du jour du badgeage (fin = ∞ si en cours). */
function intervalle(b: { heureDebut: string; heureFin: string | null }): [number, number] | null {
  const debut = minutesDepuisMinuit(b.heureDebut);
  if (debut === null) return null;
  if (!b.heureFin) return [debut, Number.POSITIVE_INFINITY];
  const fin = minutesDepuisMinuit(b.heureFin);
  if (fin === null) return null;
  // Même convention que `dureeTravailMinutes` : fin antérieure = poste de nuit.
  return [debut, fin >= debut ? fin : fin + 24 * 60];
}

/** Deux badgeages d'un même jour se chevauchent-ils ? (un badgeage en cours court jusqu'à la fin de journée) */
export function badgeagesSeChevauchent(
  a: { heureDebut: string; heureFin: string | null },
  b: { heureDebut: string; heureFin: string | null },
): boolean {
  const ia = intervalle(a);
  const ib = intervalle(b);
  if (!ia || !ib) return false;
  return ia[0] < ib[1] && ib[0] < ia[1];
}

/** Premier badgeage existant (même collaborateur, même jour) chevauchant `nouveau`, sinon null. */
export function trouverChevauchement<
  T extends { id: string; heureDebut: string; heureFin: string | null },
>(
  nouveau: { heureDebut: string; heureFin: string | null },
  existants: readonly T[],
  ignorerId?: string | null,
): T | null {
  return existants.find((e) => e.id !== ignorerId && badgeagesSeChevauchent(nouveau, e)) ?? null;
}

// ─────────────────────────────────────────────────────────────
// Absences
// ─────────────────────────────────────────────────────────────

/** Part de la journée `iso` couverte par l'absence (0, 0,5 ou 1). */
export function fractionAbsenceJour(a: AbsenceSource, iso: IsoDate): number {
  if (iso < a.dateDebut || iso > a.dateFin) return 0;
  let fraction = 1;
  if (iso === a.dateDebut && a.demiJourneeDebut) fraction -= 0.5;
  if (iso === a.dateFin && a.demiJourneeFin) fraction -= 0.5;
  return Math.max(0, fraction);
}

// ─────────────────────────────────────────────────────────────
// Construction de la feuille
// ─────────────────────────────────────────────────────────────

function arrondir(n: number): number {
  return Math.round(n);
}

/**
 * Construit la feuille de temps de la semaine commençant à `lundi`.
 * Une ligne par collaborateur de `employes` (ordre conservé) ; les badgeages
 * d'un collaborateur absent de `employes` ou hors semaine sont ignorés.
 */
export function construireFeuilleTemps(p: {
  lundi: IsoDate;
  employes: readonly EmployeFeuille[];
  badgeages: readonly BadgeageSource[];
  absences?: readonly AbsenceSource[];
  feries?: readonly FerieSource[];
}): FeuilleTemps {
  const lundi = lundiDeLaSemaine(p.lundi);
  const jours = joursDeLaSemaine(lundi);
  const dimanche = jours[6] ?? ajouterJours(lundi, 6);

  // Index : badgeages par employé puis par jour.
  const badgeagesParEmploye = new Map<string, Map<IsoDate, BadgeageSource[]>>();
  for (const b of p.badgeages) {
    if (b.dateBadgeage < lundi || b.dateBadgeage > dimanche) continue;
    const parJour = badgeagesParEmploye.get(b.employeId) ?? new Map<IsoDate, BadgeageSource[]>();
    const liste = parJour.get(b.dateBadgeage) ?? [];
    liste.push(b);
    parJour.set(b.dateBadgeage, liste);
    badgeagesParEmploye.set(b.employeId, parJour);
  }

  const absencesParEmploye = new Map<string, AbsenceSource[]>();
  for (const a of p.absences ?? []) {
    const liste = absencesParEmploye.get(a.employeId) ?? [];
    liste.push(a);
    absencesParEmploye.set(a.employeId, liste);
  }

  const lignes: LigneFeuille[] = p.employes.map((employe) => {
    // Fériés chômés applicables au collaborateur (globaux + ceux de son site).
    const feriesEmploye = new Map<IsoDate, string>();
    for (const f of p.feries ?? []) {
      if (f.siteId === null || (employe.siteId !== null && f.siteId === employe.siteId)) {
        if (!feriesEmploye.has(f.date)) feriesEmploye.set(f.date, f.libelle);
      }
    }
    const feriesSet = new Set(feriesEmploye.keys());
    const parJour = badgeagesParEmploye.get(employe.id);
    const absences = absencesParEmploye.get(employe.id) ?? [];

    const joursLigne: JourFeuille[] = jours.map((date) => {
      const badgeages: BadgeageCalcule[] = [...(parJour?.get(date) ?? [])]
        .sort((x, y) => x.heureDebut.localeCompare(y.heureDebut))
        .map((b) => {
          const minutes = b.heureFin ? minutesBadgeage(b) : null;
          return { ...b, minutes, enCours: b.heureFin === null };
        });
      const minutesTravaillees = badgeages.reduce((s, b) => s + (b.minutes ?? 0), 0);

      const absencesJour: AbsenceJour[] = absences
        .map((a) => ({ a, fraction: fractionAbsenceJour(a, date) }))
        .filter((x) => x.fraction > 0)
        .map(({ a, fraction }) => ({
          libelle: a.libelle,
          code: a.code,
          couleur: a.couleur,
          fraction,
        }));
      const partAbsente = Math.min(
        1,
        absencesJour.reduce((s, a) => s + a.fraction, 0),
      );

      const minutesTheoriques =
        employe.horaire === null
          ? null
          : arrondir(
              heuresTheoriquesJour(employe.horaire, date, feriesSet) * 60 * (1 - partAbsente),
            );

      return {
        date,
        badgeages,
        minutesTravaillees,
        minutesTheoriques,
        ecartMinutes: minutesTheoriques === null ? null : minutesTravaillees - minutesTheoriques,
        ferie: feriesEmploye.get(date) ?? null,
        absences: absencesJour,
        enCours: badgeages.some((b) => b.enCours),
      };
    });

    const tous = joursLigne.flatMap((j) => j.badgeages);
    const minutesTravaillees = joursLigne.reduce((s, j) => s + j.minutesTravaillees, 0);
    const minutesTheoriques =
      employe.horaire === null
        ? null
        : joursLigne.reduce((s, j) => s + (j.minutesTheoriques ?? 0), 0);
    const termines = tous.filter((b) => !b.enCours);
    const nbNonValides = termines.filter((b) => !b.valide).length;

    return {
      employe: {
        id: employe.id,
        nom: employe.nom,
        prenom: employe.prenom,
        matricule: employe.matricule,
        horaireNom: employe.horaireNom,
      },
      jours: joursLigne,
      minutesTravaillees,
      minutesTheoriques,
      ecartMinutes: minutesTheoriques === null ? null : minutesTravaillees - minutesTheoriques,
      nbBadgeages: tous.length,
      nbNonValides,
      nbEnCours: tous.length - termines.length,
      semaineValidee: termines.length > 0 && nbNonValides === 0,
    };
  });

  return { lundi, dimanche, jours, lignes, totaux: totauxFeuille(lignes) };
}

/** Totaux d'un ensemble de lignes (théorique et écart : lignes avec horaire uniquement). */
export function totauxFeuille(lignes: readonly LigneFeuille[]): TotauxFeuille {
  return lignes.reduce<TotauxFeuille>(
    (t, l) => ({
      nbEmployes: t.nbEmployes + 1,
      minutesTravaillees: t.minutesTravaillees + l.minutesTravaillees,
      minutesTheoriques: t.minutesTheoriques + (l.minutesTheoriques ?? 0),
      ecartMinutes: t.ecartMinutes + (l.ecartMinutes ?? 0),
      nbBadgeages: t.nbBadgeages + l.nbBadgeages,
      nbNonValides: t.nbNonValides + l.nbNonValides,
      nbEnCours: t.nbEnCours + l.nbEnCours,
    }),
    {
      nbEmployes: 0,
      minutesTravaillees: 0,
      minutesTheoriques: 0,
      ecartMinutes: 0,
      nbBadgeages: 0,
      nbNonValides: 0,
      nbEnCours: 0,
    },
  );
}

/** Écart signé lisible : `+1 h 30`, `−0 h 45`, `0 h`. */
export function formatEcartMinutes(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes === 0) return '0 h';
  const signe = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `${signe}${h} h` : `${signe}${h} h ${String(m).padStart(2, '0')}`;
}
