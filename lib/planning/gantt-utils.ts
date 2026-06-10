/**
 * Utilitaires purs pour le rendu du Gantt — date math, regroupement, KPIs.
 * Aucune dépendance React/DOM, 100% testable côté unitaire.
 *
 * Convention dates : strings ISO `AAAA-MM-JJ`. Toutes les arithmétiques sont
 * faites en UTC pour éviter les décalages de fuseau (cf. maquette `parseD`).
 */

import type { PlanningTacheRow } from '@/lib/planning/planning';

// ─────────────────────────────────────────────────────────────
// Palette des corps de métier (cohérente avec la maquette)
// ─────────────────────────────────────────────────────────────

export type CorpsMetierCle =
  | 'gros_oeuvre'
  | 'terrassement'
  | 'maconnerie'
  | 'structure'
  | 'finitions'
  | 'securite'
  | 'installation'
  | 'livraison';

export const CATS: Record<CorpsMetierCle, { label: string; fill: string }> = {
  gros_oeuvre: { label: 'Gros œuvre', fill: '#f59e0b' },
  terrassement: { label: 'Terrassement / remblais', fill: '#78716c' },
  maconnerie: { label: 'Maçonnerie (agglos)', fill: '#f97316' },
  structure: { label: 'Structure / réseaux', fill: '#0ea5e9' },
  finitions: { label: 'Finitions', fill: '#10b981' },
  securite: { label: 'Sécurité', fill: '#f43f5e' },
  installation: { label: 'Installation / grue', fill: '#64748b' },
  livraison: { label: 'Livraison (jalon)', fill: '#8b5cf6' },
};

/** Récupère la palette d'une tâche, avec fallback neutre si `corpsMetier` inconnu. */
export function catOf(corpsMetier: string | null): { label: string; fill: string } {
  if (corpsMetier && corpsMetier in CATS) {
    return CATS[corpsMetier as CorpsMetierCle];
  }
  return { label: corpsMetier ?? 'Autre', fill: '#94a3b8' };
}

// ─────────────────────────────────────────────────────────────
// Date math (UTC, jours entiers)
// ─────────────────────────────────────────────────────────────

export const DAY_MS = 86_400_000;
export const MOIS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

export function parseD(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

/** Convertit une date (string ISO ou Date) en jours UTC depuis l'epoch. */
export function dnum(d: string | Date): number {
  const t = typeof d === 'string' ? parseD(d).getTime() : d.getTime();
  return Math.floor(t / DAY_MS);
}

/** Inverse : `dnum` → Date UTC à minuit. */
export function fromN(n: number): Date {
  return new Date(n * DAY_MS);
}

/** Date → string ISO `AAAA-MM-JJ`. */
export function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Ajoute `n` jours à une string ISO. `n` peut être négatif. */
export function addDays(s: string, n: number): string {
  return iso(fromN(dnum(s) + n));
}

/** Format compact « 12 mars » pour les labels de tâches. */
export function fmtFR(s: string): string {
  const d = parseD(s);
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

/** Numéro de semaine ISO (1-53), aligné sur la maquette. */
export function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - first.getTime()) / DAY_MS - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}

// ─────────────────────────────────────────────────────────────
// Plage temporelle du Gantt
// ─────────────────────────────────────────────────────────────

export type Range = {
  start: number; // dnum du début
  end: number; // dnum de la fin
  totalDays: number;
  projectStart: string | null;
  projectEnd: string | null;
};

/**
 * Plage couvrant toutes les tâches avec dates, étendue de 3 j à gauche et 6 j
 * à droite pour aérer l'affichage (comme la maquette).
 *
 * Si aucune tâche n'a de date, retourne une plage d'un mois autour d'aujourd'hui.
 */
export function computeRange(
  taches: ReadonlyArray<{ dateDebutPrevue: string | null; dateFinPrevue: string | null }>,
  today = new Date(),
): Range {
  const datees = taches.filter((t) => t.dateDebutPrevue && t.dateFinPrevue);
  if (datees.length === 0) {
    const c = dnum(today);
    return {
      start: c - 15,
      end: c + 15,
      totalDays: 31,
      projectStart: null,
      projectEnd: null,
    };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const t of datees) {
    min = Math.min(min, dnum(t.dateDebutPrevue!));
    max = Math.max(max, dnum(t.dateFinPrevue!));
  }
  return {
    start: min - 3,
    end: max + 6,
    totalDays: max - min + 10,
    projectStart: iso(fromN(min)),
    projectEnd: iso(fromN(max)),
  };
}

/**
 * Construit la plage d'affichage de la vue d'ensemble multi-chantier :
 *   - DÉBUT à `joursAvant` jours avant `today` (par défaut J-15 : on garde un
 *     peu de contexte récent au bord gauche),
 *   - FIN = `anneesPlage` ans après le début (fenêtre standard de 2 ans, bon
 *     compromis pour tous les zooms), ÉTENDUE si un chantier va au-delà (fin de
 *     son mois + `padMois` mois de marge).
 *
 * `today` est une date ISO `AAAA-MM-JJ`. Toujours ancrée sur aujourd'hui, même
 * sans tâche datée.
 */
export function elargirRange(
  range: Range,
  today: string,
  opts: { joursAvant?: number; anneesPlage?: number; padMois?: number } = {},
): Range {
  const joursAvant = opts.joursAvant ?? 15;
  const anneesPlage = opts.anneesPlage ?? 2;
  const padMois = opts.padMois ?? 1;

  const startN = dnum(today) - joursAvant;
  const startDate = fromN(startN);

  // Fenêtre standard : `anneesPlage` ans à partir du début.
  let end = new Date(
    Date.UTC(
      startDate.getUTCFullYear() + anneesPlage,
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
    ),
  );
  // Étend si un chantier dépasse la fenêtre (fin de son mois + marge).
  if (range.projectEnd) {
    const de = parseD(range.projectEnd);
    const finProjet = new Date(Date.UTC(de.getUTCFullYear(), de.getUTCMonth() + 1 + padMois, 0));
    if (finProjet.getTime() > end.getTime()) end = finProjet;
  }

  const endN = dnum(end);
  return {
    start: startN,
    end: endN,
    totalDays: endN - startN + 1,
    projectStart: range.projectStart,
    projectEnd: range.projectEnd,
  };
}

// ─────────────────────────────────────────────────────────────
// Niveaux : ordre canonique (préparation, installation, sous-sol, étages…)
// ─────────────────────────────────────────────────────────────

const ORDRE_NIVEAUX_CONNUS = ['prep', 'inst', 'ss', 'rdc', 'r1', 'r2', 'r3', 'r4', 'r5', 'repli'];
const LABELS_NIVEAUX: Record<string, string> = {
  prep: 'Préparation',
  inst: 'Installation chantier',
  ss: 'Sous-sol (SS)',
  rdc: 'RDC',
  r1: 'R+1',
  r2: 'R+2',
  r3: 'R+3',
  r4: 'R+4',
  r5: 'R+5',
  repli: 'Repli du chantier',
};

export function labelNiveau(key: string): string {
  return LABELS_NIVEAUX[key] ?? key.toUpperCase();
}

/**
 * Trie les clés de groupe :
 *   - les niveaux connus dans l'ordre canonique,
 *   - puis les inconnus alphabétiquement,
 *   - `null`/'' en dernier sous la clé `__autres`.
 */
export function trierNiveaux(cles: ReadonlyArray<string>): string[] {
  const connus = new Set(ORDRE_NIVEAUX_CONNUS);
  const enConnus: string[] = [];
  const enInconnus: string[] = [];
  for (const k of cles) {
    if (connus.has(k)) enConnus.push(k);
    else enInconnus.push(k);
  }
  enConnus.sort((a, b) => ORDRE_NIVEAUX_CONNUS.indexOf(a) - ORDRE_NIVEAUX_CONNUS.indexOf(b));
  enInconnus.sort();
  return [...enConnus, ...enInconnus];
}

// ─────────────────────────────────────────────────────────────
// Layout : rangs (group + tâche) avec positions Y
// ─────────────────────────────────────────────────────────────

export const ROW_H = 34;
export const GROUP_H = 38;
export const HEAD_H = 52;

export type GroupKey = { key: string; label: string; cat?: CorpsMetierCle };

export type LayoutRow =
  | { type: 'group'; group: GroupKey; y: number; h: number; tasks: PlanningTacheRow[] }
  | { type: 'task'; task: PlanningTacheRow; y: number; h: number };

export type Layout = {
  rows: LayoutRow[];
  height: number;
};

export type GroupByMode = 'niveau' | 'metier';

/**
 * Construit la mise en page verticale du Gantt en respectant :
 *   - le mode de regroupement (`niveau` ou `corps_metier`),
 *   - les corps de métier masqués,
 *   - les groupes pliés,
 *   - le filtre « masquer terminées passées ».
 */
export function buildLayout(
  taches: ReadonlyArray<PlanningTacheRow>,
  options: {
    groupBy: GroupByMode;
    collapsed: ReadonlySet<string>;
    hiddenCats: ReadonlySet<string>;
    hideDone: boolean;
    today: string;
  },
): Layout {
  const today = dnum(options.today);
  const tachesVisibles = taches.filter((t) => {
    if (t.corpsMetier && options.hiddenCats.has(t.corpsMetier)) return false;
    if (
      options.hideDone &&
      (t.avancementPourcent ?? 0) >= 100 &&
      t.dateFinPrevue &&
      dnum(t.dateFinPrevue) < today
    ) {
      return false;
    }
    return true;
  });

  // Construit la liste des groupes ordonnés selon le mode.
  let groupes: GroupKey[];
  if (options.groupBy === 'metier') {
    const presents = new Set<string>();
    for (const t of tachesVisibles) {
      const c = t.corpsMetier ?? '__autres';
      presents.add(c);
    }
    const ordre = (Object.keys(CATS) as CorpsMetierCle[]).filter((k) => presents.has(k));
    const autres = [...presents].filter((k) => !(k in CATS));
    autres.sort();
    groupes = [
      ...ordre.map((k) => ({ key: `cat:${k}`, label: CATS[k].label, cat: k })),
      ...autres.map((k) => ({ key: `cat:${k}`, label: k === '__autres' ? 'Autres' : k })),
    ];
  } else {
    const cles = [...new Set(tachesVisibles.map((t) => t.niveau ?? '__autres'))];
    groupes = trierNiveaux(cles).map((k) => ({
      key: k,
      label: k === '__autres' ? 'Autres' : labelNiveau(k),
    }));
  }

  // Place les rangs (groupe puis tâches éventuelles).
  const rows: LayoutRow[] = [];
  let y = 0;
  for (const g of groupes) {
    const tks =
      options.groupBy === 'metier'
        ? tachesVisibles.filter((t) => `cat:${t.corpsMetier ?? '__autres'}` === g.key)
        : tachesVisibles.filter((t) => (t.niveau ?? '__autres') === g.key);
    if (tks.length === 0) continue;
    rows.push({ type: 'group', group: g, y, h: GROUP_H, tasks: tks });
    y += GROUP_H;
    if (!options.collapsed.has(g.key)) {
      for (const t of tks) {
        rows.push({ type: 'task', task: t, y, h: ROW_H });
        y += ROW_H;
      }
    }
  }
  return { rows, height: y };
}

// ─────────────────────────────────────────────────────────────
// KPIs : avancement pondéré, heures, statut planning vs attendu
// ─────────────────────────────────────────────────────────────

export type KpisResult = {
  avancementPourcent: number;
  avancementAttenduPourcent: number;
  deltaPoints: number;
  heuresPlanifiees: number;
  heuresFaites: number;
  statut: 'en_avance' | 'a_lheure' | 'en_retard';
  joursDecalage: number;
  finPrevueIso: string | null;
};

/**
 * KPIs pondérés par les heures planifiées (au défaut, par tâche).
 * Aligne sur la maquette `updateKPIs` :
 *   - avancement réel = ∑ (poids × progress) / ∑ poids
 *   - avancement attendu = ∑ (poids × % attendu à la date du jour) / ∑ poids
 *   - statut planning si |delta| < 3 points → à l'heure ; delta ≥ 3 → en avance ; ≤ -3 → en retard.
 */
export function calculerKpis(
  taches: ReadonlyArray<PlanningTacheRow>,
  today: string,
  range: Range,
): KpisResult {
  let poidsTotal = 0;
  let avancement = 0;
  let attendu = 0;
  let heuresPlan = 0;
  let heuresFait = 0;
  const tDay = dnum(today);

  for (const t of taches) {
    const heures = t.heuresPlanifiees ?? 0;
    const equipeFait = (t.equipe ?? []).reduce((s, w) => s + (w.heuresFaites ?? 0), 0);
    const equipePlan = (t.equipe ?? []).reduce((s, w) => s + (w.heuresPrevues ?? 0), 0);
    heuresPlan += heures || equipePlan;
    heuresFait += equipeFait;

    const poids = (heures || equipePlan || 1);
    poidsTotal += poids;

    avancement += poids * (t.avancementPourcent ?? 0);

    // Avancement attendu : 100 si la tâche est passée, 0 si future, prorata sinon.
    let exp = 0;
    if (t.dateDebutPrevue && t.dateFinPrevue) {
      const start = dnum(t.dateDebutPrevue);
      const end = dnum(t.dateFinPrevue);
      if (end < tDay) exp = 100;
      else if (start <= tDay) {
        const dur = end - start + 1;
        exp = Math.round(((tDay - start + 1) / dur) * 100);
      }
    }
    attendu += poids * exp;
  }

  const av = poidsTotal > 0 ? Math.round(avancement / poidsTotal) : 0;
  const ex = poidsTotal > 0 ? Math.round(attendu / poidsTotal) : 0;
  const delta = av - ex;

  const projectSpan =
    range.projectStart && range.projectEnd
      ? dnum(range.projectEnd) - dnum(range.projectStart) + 1
      : 0;
  const jours = Math.round((delta / 100) * projectSpan);

  let statut: KpisResult['statut'];
  if (delta >= 3) statut = 'en_avance';
  else if (delta <= -3) statut = 'en_retard';
  else statut = 'a_lheure';

  return {
    avancementPourcent: av,
    avancementAttenduPourcent: ex,
    deltaPoints: delta,
    heuresPlanifiees: heuresPlan,
    heuresFaites: heuresFait,
    statut,
    joursDecalage: jours,
    finPrevueIso: range.projectEnd,
  };
}

// ─────────────────────────────────────────────────────────────
// Pixels par jour selon le zoom
// ─────────────────────────────────────────────────────────────

export type Zoom = 'jour' | 'semaine' | 'mois' | 'annee';
export const PX_PAR_JOUR: Record<Zoom, number> = { jour: 26, semaine: 11, mois: 4.2, annee: 1.6 };

export function xOf(dateIso: string, range: Range, zoom: Zoom): number {
  return (dnum(dateIso) - range.start) * PX_PAR_JOUR[zoom];
}
export function widthOf(start: string, end: string, zoom: Zoom): number {
  return (dnum(end) - dnum(start) + 1) * PX_PAR_JOUR[zoom];
}
