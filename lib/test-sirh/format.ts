/**
 * Helpers de formatage purs et déterministes du module Test SIRH.
 *
 * Pas d'`Intl` (même règle que lib/flotte/format.ts) : le rendu serveur et
 * l'hydratation client produisent exactement la même chaîne.
 */

import { dateHeureParis } from './fuseau';

const MOIS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

const JOURS_COURTS_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'] as const;

/** Sépare les milliers par une espace : `1234567` → `1 234 567`. */
function grouperMilliers(entier: string): string {
  return entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Convertit une valeur numérique (number, chaîne Drizzle `numeric`, null) en nombre fini ou null. */
export function versNombre(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** `2026-06-13` → `13/06/2026` ; vide → `—`. */
export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** `2026-06-13` → `sam. 13/06` (libellé court de calendrier). */
export function formatJourCourt(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const jour = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${JOURS_COURTS_FR[jour]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** `(2026, 10)` → `octobre 2026`. */
export function formatMois(annee: number, mois: number): string {
  const libelle = MOIS_FR[mois - 1];
  return libelle ? `${libelle} ${annee}` : `${mois}/${annee}`;
}

/**
 * `Date` ou ISO → `13/06/2026 14:05` en heure légale de Paris (heure d'été /
 * d'hiver calculée sans `Intl` : rendu identique serveur / client).
 */
export function formatDateHeure(valeur: Date | string | null | undefined): string {
  const local = dateHeureParis(valeur);
  if (!local) return '—';
  return `${formatDateFr(local.date)} ${local.heure}`;
}

/**
 * Nombre décimal à la française : `1234.5` → `1 234,5`. `decimales` fixe le
 * nombre de décimales ; par défaut on retire les zéros inutiles (max 2).
 */
export function formatNombre(v: number | string | null | undefined, decimales?: number): string {
  const n = versNombre(v);
  if (n === null) return '—';
  const fixe = n.toFixed(decimales ?? 2);
  const [ent = '0', dec = ''] = fixe.replace('-', '').split('.');
  const decNettoyee = decimales === undefined ? dec.replace(/0+$/, '') : dec;
  const signe = n < 0 && Number(fixe) !== 0 ? '-' : '';
  return `${signe}${grouperMilliers(ent)}${decNettoyee ? `,${decNettoyee}` : ''}`;
}

/** Montant en euros à 2 décimales : `1234.5` → `1 234,50 €`. */
export function formatEuro(v: number | string | null | undefined): string {
  const n = versNombre(v);
  if (n === null) return '—';
  return `${formatNombre(n, 2)} €`;
}

/** Montant en euros arrondi à l'unité (KPI) : `8420.4` → `8 420 €`. */
export function formatEuroArrondi(v: number | string | null | undefined): string {
  const n = versNombre(v);
  if (n === null) return '—';
  return `${formatNombre(Math.round(n), 0)} €`;
}

/** Durée en jours : `2.5` → `2,5 j` ; `1` → `1 j`. */
export function formatJours(v: number | string | null | undefined): string {
  const n = versNombre(v);
  if (n === null) return '—';
  return `${formatNombre(n)} j`;
}

/** Durée en heures décimales → `7 h 30` ; `8` → `8 h`. */
export function formatHeures(v: number | string | null | undefined): string {
  const n = versNombre(v);
  if (n === null) return '—';
  const signe = n < 0 ? '−' : '';
  const totalMinutes = Math.round(Math.abs(n) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${signe}${h} h` : `${signe}${h} h ${String(m).padStart(2, '0')}`;
}

/** Minutes → `7 h 30` (durées de badgeage). */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  return formatHeures(minutes / 60);
}

/** `08:30:00` → `08:30`. */
export function formatHeure(heure: string | null | undefined): string {
  if (!heure) return '—';
  return heure.slice(0, 5);
}

/** Pourcentage entier : `42` → `42 %`. */
export function formatPourcent(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${Math.round(v)} %`;
}

/** « Prénom Nom » (ordre d'affichage du SIRH) ; tolère les valeurs manquantes. */
export function nomComplet(
  prenom: string | null | undefined,
  nom: string | null | undefined,
): string {
  return [prenom, nom].filter((s) => s && s.trim().length > 0).join(' ') || '—';
}

/** Initiales pour les pastilles d'avatar : `Marc Dubois` → `MD`. */
export function initiales(
  prenom: string | null | undefined,
  nom: string | null | undefined,
): string {
  const i = `${prenom?.trim().charAt(0) ?? ''}${nom?.trim().charAt(0) ?? ''}`;
  return i.toUpperCase() || '?';
}

/** Taille de fichier lisible : `2048` → `2 Ko`. */
export function formatTaille(octets: number | null | undefined): string {
  if (!octets || octets <= 0) return '—';
  const unites = ['o', 'Ko', 'Mo', 'Go'];
  let i = 0;
  let v = octets;
  while (v >= 1024 && i < unites.length - 1) {
    v /= 1024;
    i++;
  }
  const arrondi = v >= 10 || i === 0 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${formatNombre(arrondi)} ${unites[i]}`;
}

/** Ancienneté lisible entre deux dates ISO : `3 ans 2 mois`, `5 mois`, `< 1 mois`. */
export function formatAnciennete(depuis: string | null | undefined, jusqua: string): string {
  if (!depuis) return '—';
  const [y1, m1, d1] = depuis.split('-').map(Number);
  const [y2, m2, d2] = jusqua.split('-').map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return '—';
  let mois = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) mois -= 1;
  if (mois < 0) return '—';
  if (mois === 0) return '< 1 mois';
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  const partAns = ans > 0 ? `${ans} an${ans > 1 ? 's' : ''}` : '';
  const partMois = reste > 0 ? `${reste} mois` : '';
  return [partAns, partMois].filter(Boolean).join(' ');
}
