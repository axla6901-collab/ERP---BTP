/**
 * Moteur de calendrier du module Test SIRH — fonctions PURES (aucune I/O),
 * importables côté client comme serveur.
 *
 * Toutes les dates sont des chaînes ISO `YYYY-MM-DD` manipulées en UTC : aucun
 * effet de fuseau horaire ni de changement d'heure, et rendu identique serveur /
 * client. (Équivalent fonctionnel des ressources Factorial `holidays` et
 * `timeoff/FrenchLeaveDayCount`.)
 */

export type IsoDate = string;

const MS_PAR_JOUR = 86_400_000;

function versDate(iso: IsoDate): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Date ISO invalide : ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

function versIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

/** Vrai si `iso` est une date calendaire valide au format `YYYY-MM-DD`. */
export function estDateIso(iso: string | null | undefined): iso is IsoDate {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = versDate(iso);
  return versIso(d) === iso;
}

/** Date du jour (UTC) au format ISO — à calculer côté serveur et propager au client. */
export function aujourdhuiIso(maintenant: Date = new Date()): IsoDate {
  return maintenant.toISOString().slice(0, 10);
}

export function ajouterJours(iso: IsoDate, jours: number): IsoDate {
  return versIso(new Date(versDate(iso).getTime() + jours * MS_PAR_JOUR));
}

/** Ajoute `mois` mois ; le jour est borné à la fin du mois cible (31/01 + 1 mois → 28 ou 29/02). */
export function ajouterMois(iso: IsoDate, mois: number): IsoDate {
  const d = versDate(iso);
  const cible = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + mois, 1));
  const dernierJour = new Date(
    Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cible.setUTCDate(Math.min(d.getUTCDate(), dernierJour));
  return versIso(cible);
}

/** Jour de la semaine : 0 = dimanche … 6 = samedi. */
export function jourSemaine(iso: IsoDate): number {
  return versDate(iso).getUTCDay();
}

/** Nombre de jours de `debut` à `fin` (fin − debut ; négatif si fin < debut). */
export function differenceJours(debut: IsoDate, fin: IsoDate): number {
  return Math.round((versDate(fin).getTime() - versDate(debut).getTime()) / MS_PAR_JOUR);
}

/** Liste des jours de `debut` à `fin` inclus (vide si fin < debut). */
export function enumererJours(debut: IsoDate, fin: IsoDate): IsoDate[] {
  const n = differenceJours(debut, fin);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => ajouterJours(debut, i));
}

export function premierJourDuMois(annee: number, mois: number): IsoDate {
  return versIso(new Date(Date.UTC(annee, mois - 1, 1)));
}

export function dernierJourDuMois(annee: number, mois: number): IsoDate {
  return versIso(new Date(Date.UTC(annee, mois, 0)));
}

/** Les intervalles fermés [aDebut, aFin] et [bDebut, bFin] se chevauchent-ils ? */
export function chevauchement(
  aDebut: IsoDate,
  aFin: IsoDate,
  bDebut: IsoDate,
  bFin: IsoDate,
): boolean {
  return aDebut <= bFin && bDebut <= aFin;
}

// ─────────────────────────────────────────────────────────────
// Jours fériés français
// ─────────────────────────────────────────────────────────────

/** Dimanche de Pâques (calendrier grégorien, algorithme de Meeus/Jones/Butcher). */
export function dimanchePaques(annee: number): IsoDate {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return versIso(new Date(Date.UTC(annee, mois - 1, jour)));
}

export type JourFerieCalcule = { date: IsoDate; libelle: string };

/**
 * Les 11 jours fériés légaux en France métropolitaine (art. L3133-1 C. trav.),
 * triés par date. Option `alsaceMoselle` : + Vendredi saint et Saint-Étienne (26/12).
 */
export function joursFeriesFrance(
  annee: number,
  options: { alsaceMoselle?: boolean } = {},
): JourFerieCalcule[] {
  const paques = dimanchePaques(annee);
  const fixe = (mois: number, jour: number) => versIso(new Date(Date.UTC(annee, mois - 1, jour)));
  const liste: JourFerieCalcule[] = [
    { date: fixe(1, 1), libelle: "Jour de l'an" },
    { date: ajouterJours(paques, 1), libelle: 'Lundi de Pâques' },
    { date: fixe(5, 1), libelle: 'Fête du Travail' },
    { date: fixe(5, 8), libelle: 'Victoire 1945' },
    { date: ajouterJours(paques, 39), libelle: 'Ascension' },
    { date: ajouterJours(paques, 50), libelle: 'Lundi de Pentecôte' },
    { date: fixe(7, 14), libelle: 'Fête nationale' },
    { date: fixe(8, 15), libelle: 'Assomption' },
    { date: fixe(11, 1), libelle: 'Toussaint' },
    { date: fixe(11, 11), libelle: 'Armistice 1918' },
    { date: fixe(12, 25), libelle: 'Noël' },
  ];
  if (options.alsaceMoselle) {
    liste.push(
      { date: ajouterJours(paques, -2), libelle: 'Vendredi saint' },
      { date: fixe(12, 26), libelle: 'Saint-Étienne' },
    );
  }
  return liste.sort((x, y) => x.date.localeCompare(y.date));
}

// ─────────────────────────────────────────────────────────────
// Décompte des absences
// ─────────────────────────────────────────────────────────────

export type UniteDecompteJours = 'jours_ouvrables' | 'jours_ouvres' | 'jours_calendaires';

/** Le jour compte-t-il dans l'unité donnée ? (fériés exclus des ouvrés/ouvrables) */
export function jourDecompte(
  iso: IsoDate,
  unite: UniteDecompteJours,
  feries: ReadonlySet<IsoDate>,
): boolean {
  if (unite === 'jours_calendaires') return true;
  const j = jourSemaine(iso);
  if (j === 0) return false; // dimanche
  if (unite === 'jours_ouvres' && j === 6) return false; // samedi
  return !feries.has(iso);
}

export type ParamsDecompte = {
  dateDebut: IsoDate;
  dateFin: IsoDate;
  /** L'absence commence l'après-midi de `dateDebut`. */
  demiJourneeDebut?: boolean;
  /** L'absence se termine à midi le jour de `dateFin`. */
  demiJourneeFin?: boolean;
  unite: UniteDecompteJours;
  feries?: Iterable<IsoDate>;
  /**
   * Jours ouvrables uniquement (règle des congés payés) : une absence qui se
   * termine un vendredi (journée entière) décompte aussi le samedi suivant, le
   * décompte courant jusqu'à la veille de la reprise. Activé par défaut.
   */
  samediFinal?: boolean;
};

/**
 * Durée décomptée d'une absence, en jours (pas de 0,5). Renvoie 0 si la
 * période est vide ou inversée. L'unité « heures » n'est pas gérée ici : la
 * durée est alors saisie par l'utilisateur.
 */
export function compterJoursAbsence(p: ParamsDecompte): number {
  if (p.dateFin < p.dateDebut) return 0;
  const feries = new Set(p.feries ?? []);
  const jours = enumererJours(p.dateDebut, p.dateFin);
  let total = 0;
  for (const j of jours) if (jourDecompte(j, p.unite, feries)) total += 1;

  if (p.demiJourneeDebut && jourDecompte(p.dateDebut, p.unite, feries)) total -= 0.5;
  if (
    p.demiJourneeFin &&
    jourDecompte(p.dateFin, p.unite, feries) &&
    // Jour unique déjà réduit à une demi-journée par `demiJourneeDebut`.
    !(p.dateDebut === p.dateFin && p.demiJourneeDebut)
  ) {
    total -= 0.5;
  }

  const samediFinal = p.samediFinal ?? true;
  if (
    p.unite === 'jours_ouvrables' &&
    samediFinal &&
    !p.demiJourneeFin &&
    jourSemaine(p.dateFin) === 5
  ) {
    const samedi = ajouterJours(p.dateFin, 1);
    if (!feries.has(samedi)) total += 1;
  }

  return Math.max(0, Math.round(total * 100) / 100);
}

// ─────────────────────────────────────────────────────────────
// Périodes de référence (compteurs de congés)
// ─────────────────────────────────────────────────────────────

/**
 * Période de référence annuelle contenant `iso`, commençant le 1er du mois
 * `moisDebut`. Dans le BTP, la période des congés payés gérés par la caisse
 * CIBTP court du 1er avril au 31 mars (`moisDebut = 4`, valeur par défaut) ;
 * régime général : 1er juin → 31 mai (`moisDebut = 6`).
 */
export function periodeReference(iso: IsoDate, moisDebut = 4): { debut: IsoDate; fin: IsoDate } {
  const d = versDate(iso);
  const annee = d.getUTCMonth() + 1 >= moisDebut ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const debut = premierJourDuMois(annee, moisDebut);
  const fin = ajouterJours(ajouterMois(debut, 12), -1);
  return { debut, fin };
}

// ─────────────────────────────────────────────────────────────
// Temps de travail
// ─────────────────────────────────────────────────────────────

/** `HH:MM` ou `HH:MM:SS` → minutes depuis minuit (null si invalide). */
export function minutesDepuisMinuit(heure: string | null | undefined): number | null {
  if (!heure) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(heure.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Durée de travail effectif d'un badgeage, en minutes (pause déduite).
 * `heureFin` antérieure à `heureDebut` = poste de nuit franchissant minuit.
 * Renvoie `null` si le badgeage est en cours (pas d'heure de fin) ou invalide.
 */
export function dureeTravailMinutes(
  heureDebut: string,
  heureFin: string | null | undefined,
  pauseMinutes = 0,
): number | null {
  const debut = minutesDepuisMinuit(heureDebut);
  const fin = minutesDepuisMinuit(heureFin);
  if (debut === null || fin === null) return null;
  const brut = fin >= debut ? fin - debut : fin + 24 * 60 - debut;
  return Math.max(0, brut - Math.max(0, pauseMinutes));
}

/** Horaire hebdomadaire en heures par jour (index 0 = dimanche, comme `jourSemaine`). */
export type HoraireSemaine = readonly [number, number, number, number, number, number, number];

/** Construit un `HoraireSemaine` depuis une ligne `sirh_horaires` (numeric → number). */
export function horaireDepuisLigne(ligne: {
  heuresLundi: string | number;
  heuresMardi: string | number;
  heuresMercredi: string | number;
  heuresJeudi: string | number;
  heuresVendredi: string | number;
  heuresSamedi: string | number;
  heuresDimanche: string | number;
}): HoraireSemaine {
  const n = (v: string | number) => (typeof v === 'number' ? v : Number(v)) || 0;
  return [
    n(ligne.heuresDimanche),
    n(ligne.heuresLundi),
    n(ligne.heuresMardi),
    n(ligne.heuresMercredi),
    n(ligne.heuresJeudi),
    n(ligne.heuresVendredi),
    n(ligne.heuresSamedi),
  ];
}

export function heuresHebdo(horaire: HoraireSemaine): number {
  return Math.round(horaire.reduce((acc, h) => acc + h, 0) * 100) / 100;
}

/** Heures théoriques d'un jour donné (0 si férié chômé). */
export function heuresTheoriquesJour(
  horaire: HoraireSemaine,
  iso: IsoDate,
  feries: ReadonlySet<IsoDate> = new Set(),
): number {
  if (feries.has(iso)) return 0;
  return horaire[jourSemaine(iso)] ?? 0;
}

/** Lundi de la semaine contenant `iso`. */
export function lundiDeLaSemaine(iso: IsoDate): IsoDate {
  const j = jourSemaine(iso);
  return ajouterJours(iso, j === 0 ? -6 : 1 - j);
}
