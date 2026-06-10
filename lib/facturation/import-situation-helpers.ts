/**
 * Helpers purs (sans accès DB ni auth) du parser d'import de situation.
 *
 * Extraits du Server Action `parserFichierSituation` pour permettre leur
 * test isolé (Vitest) et leur réutilisation éventuelle dans d'autres
 * imports xlsx/csv du projet.
 */

/**
 * Normalise une clé de colonne (en-tête) pour comparaison :
 * minuscules, sans accents, le symbole `%` est remplacé par `pct`, puis on
 * supprime tout caractère non alphanumérique restant.
 *
 * Le mapping `%`→`pct` garantit qu'une colonne intitulée juste `%` (cas
 * courant dans les modèles de situation Excel) reste détectable au lieu
 * de se normaliser en chaîne vide.
 *
 * @example
 * normaliserCle("Désignation")  // → "designation"
 * normaliserCle("% Avancement") // → "pctavancement"
 * normaliserCle("%")            // → "pct"
 * normaliserCle("P.U. HT (€)")  // → "puht"
 */
export function normaliserCle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/%/g, 'pct')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Alias acceptés pour chaque colonne logique de l'import de situation.
 * Les clés sont les noms canoniques côté schéma Zod, les valeurs sont les
 * variantes acceptées dans le fichier (déjà passées par `normaliserCle`).
 */
export const ALIAS_COLONNES = {
  position: ['position', 'no', 'n', 'numero', 'num', 'repere', 'rep', 'item', 'index'],
  designation: ['designation', 'libelle', 'libelles', 'poste', 'description', 'intitule'],
  quantite: ['quantite', 'qte', 'qty', 'quantity', 'q'],
  unite: ['unite', 'u', 'unit'],
  prixUnitaireHt: [
    'prixunitaireht',
    'pu',
    'puht',
    'prixunitaire',
    'prixu',
    'unitprice',
  ],
  montantMarcheHt: [
    'montantmarcheht',
    'montantmarche',
    'montantht',
    'montant',
    'total',
    'totalht',
    'marche',
  ],
  pctAvancementCumule: [
    'pctavancementcumule',
    'pctavancement',
    'pct',
    'avancement',
    'pourcentage',
    'pourcent',
    'percent',
    'progress',
  ],
  notes: ['notes', 'commentaire', 'comment', 'remarque'],
} as const satisfies Record<string, readonly string[]>;

export type CleColonne = keyof typeof ALIAS_COLONNES;

/**
 * Localise l'index d'une colonne dans le tableau d'en-têtes (lus tels quels
 * depuis le fichier), via les alias normalisés. Retourne `null` si absente.
 *
 * Deux passes :
 *   1. Match exact sur la clé normalisée (`'designation'` ↔ alias
 *      `'designation'`).
 *   2. Fallback `startsWith` pour les en-têtes étendus type
 *      `"DESIGNATION DU POSTE"` (très courants dans les DPGF d'économistes).
 *      Le second passe ne vérifie pas les alias de longueur ≤ 1 pour éviter
 *      qu'un `"q"` ne happe une colonne `"quantite économiste"` à la place
 *      du match exact attendu.
 *
 * @example
 * trouverColonne(['Désignation','Qté','Prix'], 'quantite')      // → 1
 * trouverColonne(['Description','Total HT'], 'designation')     // → 0
 * trouverColonne(['DESIGNATION DU POSTE'], 'designation')       // → 0 (fallback)
 * trouverColonne(['Foo'], 'designation')                        // → null
 */
export function trouverColonne(headers: string[], cle: CleColonne): number | null {
  const aliases = ALIAS_COLONNES[cle] as readonly string[];
  for (let i = 0; i < headers.length; i++) {
    const norm = normaliserCle(headers[i] ?? '');
    if (aliases.includes(norm)) return i;
  }
  for (let i = 0; i < headers.length; i++) {
    const norm = normaliserCle(headers[i] ?? '');
    if (norm === '') continue;
    if (aliases.some((a) => a.length > 1 && norm.startsWith(a))) return i;
  }
  return null;
}

/**
 * Normalise une valeur numérique lue depuis Excel/CSV vers une chaîne
 * exploitable par Zod (`Number(s)` doit donner un float fini ou NaN).
 *
 * Gère :
 *   - virgule décimale française (`"12,50"` → `"12.5"`)
 *   - espaces de millier normaux et insécables (`"1 234,56"` → `"1234.56"`)
 *   - symbole `%` en suffixe (`"60%"` → `"60"`)
 *   - chaîne vide → `null` (au lieu de `NaN`)
 *   - nombres natifs Excel (Date sérialisés exclus — c'est l'appelant qui gère)
 *
 * @returns la chaîne normalisée prête à parser, ou `null` si non interprétable
 */
export function nettoyerNombre(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  const s = String(raw).trim();
  if (s === '') return null;
  const nettoye = s
    .replace(/\s| /g, '')
    .replace(/%/g, '')
    .replace(',', '.');
  const n = Number(nettoye);
  return Number.isFinite(n) ? String(n) : null;
}

/**
 * Vrai si la valeur ressemble à un numéro hiérarchique d'élément BTP
 * (DPGF/situation) : `2`, `2.1`, `2.1.1`, `3.4.9.12.1.1` …
 *
 * Utilisé pour deviner si la colonne marquée "DESIGNATION" dans un modèle
 * Excel contient en fait la position et non le libellé : certains modèles
 * d'économistes utilisent la première colonne pour le numéro de poste sans
 * en-tête dédié.
 */
export function ressembleAPosition(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim();
  if (s === '') return false;
  return /^\d+(\.\d+)*\s*$/.test(s);
}

/**
 * Vrai si la désignation décrit une ligne structurelle à filtrer lors
 * de l'import (sous-total, total de lot, ligne TVA, total TTC).
 */
export function estLigneTotalOuTva(designation: string): boolean {
  const s = designation.trim().toLowerCase();
  if (s === '') return false;
  return (
    s.startsWith('total ') ||
    s === 'total' ||
    s.startsWith('sous-total') ||
    s.startsWith('sous total') ||
    s.startsWith('s/total') ||
    s.startsWith('montant ht') ||
    s.startsWith('montant tva') ||
    s.startsWith('montant ttc') ||
    s.startsWith('total h.t') ||
    s.startsWith('total t.t.c') ||
    s.startsWith('tva ') ||
    /^tva\s*\d/.test(s) ||
    s.startsWith('montant du lot') ||
    s.startsWith('montant total')
  );
}

/**
 * Normalise un pourcentage lu depuis Excel : si la valeur est entre 0 et 1
 * (inclus), on suppose qu'Excel a renvoyé la fraction décimale (cellule
 * formattée en `%` montrant `60 %` mais stockant `0.6`). Au-dessus de 1,
 * on suppose que la valeur est déjà en pourcent (saisie texte `60`).
 *
 * @example
 * normaliserPct("0.6")  // → "60"
 * normaliserPct("60")   // → "60"
 * normaliserPct(null)   // → null
 */
export function normaliserPct(pct: string | null): string | null {
  if (pct === null) return null;
  const n = Number(pct);
  if (!Number.isFinite(n)) return pct;
  if (n > 0 && n <= 1) return (n * 100).toString();
  return pct;
}
