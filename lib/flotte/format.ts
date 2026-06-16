/**
 * Helpers de formatage purs et déterministes (pas d'Intl → aucun risque de
 * divergence d'hydratation serveur/client) pour l'UI du module Flotte.
 */

/** `2026-06-13` → `13/06/2026` ; `null` → `—`. */
export function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

/** Montant entier en euros avec séparateur de milliers (espace) : `8420` → `8 420 €`. */
export function formatEuro(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === '') return '—';
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '—';
  const r = Math.round(v);
  const s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${r < 0 ? '-' : ''}${s} €`;
}

/** Nombre de jours restants → libellé court : `-3` → `−3 j`, `18` → `18 j`. */
export function formatJours(jours: number): string {
  if (jours < 0) return `−${Math.abs(jours)} j`;
  return `${jours} j`;
}

/** `87450` → `87 450`. */
export function formatNombre(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
