/**
 * Génération CSV pure (aucune I/O) pour les exports du module Test SIRH
 * (registre du personnel, variables de paie, notes de frais…).
 *
 * Format compatible Excel FR : séparateur `;`, fin de ligne CRLF, BOM UTF-8
 * optionnel, champs échappés selon la RFC 4180 (guillemets doublés).
 */

export type ColonneCsv<T> = {
  entete: string;
  valeur: (ligne: T) => string | number | boolean | null | undefined;
};

/** Échappe une cellule : guillemets si `;`, `"`, retour ligne ou espace de bord. */
export function echapperCellule(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (/[";\r\n]/.test(s) || s !== s.trim()) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function genererCsv<T>(
  colonnes: readonly ColonneCsv<T>[],
  lignes: readonly T[],
  opts: { bom?: boolean } = {},
): string {
  const entetes = colonnes.map((c) => echapperCellule(c.entete)).join(';');
  const corps = lignes.map((l) => colonnes.map((c) => echapperCellule(c.valeur(l))).join(';'));
  const contenu = [entetes, ...corps].join('\r\n');
  return (opts.bom ?? true) ? `﻿${contenu}` : contenu;
}

/** Nom de fichier sûr : `Registre du personnel 2026` → `registre-du-personnel-2026.csv`. */
export function nomFichierCsv(base: string): string {
  const slug = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'export'}.csv`;
}
