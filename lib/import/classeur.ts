import ExcelJS from 'exceljs';

/**
 * Erreur de format de classeur non pris en charge (ex. ancien binaire .xls,
 * que la bibliothèque exceljs ne sait pas lire). Les callers la distinguent
 * d'une erreur de lecture générique pour afficher un message d'aide ciblé.
 */
export class ClasseurFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClasseurFormatError';
  }
}

function messageXls(nom?: string): string {
  const cible = nom ? `« ${nom} »` : 'ce fichier';
  return `Le format .xls n'est plus pris en charge. Ouvrez ${cible} dans Excel ou LibreOffice puis « Enregistrer sous » au format .xlsx.`;
}

export type Classeur = {
  /** Noms des feuilles, dans l'ordre du classeur. */
  sheetNames: string[];
  /**
   * Renvoie une feuille sous forme de tableau de tableaux (lignes × colonnes).
   *
   * Reproduit fidèlement l'ancien socle SheetJS
   * `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })` :
   *   - une entrée par ligne physique (index 0 = 1ʳᵉ ligne du classeur) ;
   *   - une sous-entrée par colonne (index 0 = colonne A), comblée à la
   *     largeur maximale de la feuille ;
   *   - cellule vide → `null` ;
   *   - valeurs brutes : nombres en `number`, textes en `string`, booléens en
   *     `boolean`, formules → valeur calculée mise en cache.
   *
   * Renvoie `[]` si la feuille est introuvable (le caller vérifie l'existence
   * via `sheetNames`).
   */
  feuille(nom: string): unknown[][];
};

// ─────────────────────────────────────────────────────────────
// Normalisation d'une cellule (XLSX) → valeur brute
// ─────────────────────────────────────────────────────────────

/**
 * Normalise une valeur de cellule exceljs vers la même forme que SheetJS
 * `raw: true` : `number | string | boolean | Date | null`. Gère les cellules
 * « riches » d'exceljs (formules, texte enrichi, hyperliens, erreurs).
 */
function normaliserCellule(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === 'number' || t === 'string' || t === 'boolean') return value;
  if (value instanceof Date) return value;
  if (t === 'object') {
    const o = value as {
      result?: unknown;
      error?: unknown;
      text?: unknown;
      hyperlink?: unknown;
      richText?: ReadonlyArray<{ text?: unknown }>;
    };
    // Formule (et formule partagée) : { formula | sharedFormula, result } →
    // valeur calculée en cache, comme le faisait raw:true de SheetJS.
    if ('result' in o) return normaliserCellule(o.result ?? null);
    // Cellule en erreur (#REF!, #DIV/0! …) → null.
    if ('error' in o) return null;
    // Hyperlien : { text, hyperlink } → texte affiché.
    if ('hyperlink' in o && 'text' in o) return normaliserCellule(o.text ?? null);
    // Texte enrichi : { richText: [{ text }, …] } → concaténation des fragments.
    if (Array.isArray(o.richText)) {
      return o.richText.map((frag) => (typeof frag?.text === 'string' ? frag.text : '')).join('');
    }
  }
  return null;
}

async function classeurXlsx(buffer: Buffer): Promise<Classeur> {
  const workbook = new ExcelJS.Workbook();
  // @types/node 22 type `Buffer` en `Buffer<ArrayBufferLike>` ; exceljs attend un
  // `Buffer` non générique. Le Buffer Node est valide au runtime → cast ciblé.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const cache = new Map<string, unknown[][]>();

  return {
    sheetNames: workbook.worksheets.map((ws) => ws.name),
    feuille(nom: string): unknown[][] {
      const hit = cache.get(nom);
      if (hit) return hit;
      const ws = workbook.getWorksheet(nom);
      const aoa: unknown[][] = [];
      if (ws) {
        const nbLignes = ws.rowCount;
        const nbColonnes = ws.columnCount;
        for (let r = 1; r <= nbLignes; r++) {
          const row = ws.getRow(r);
          const ligne: unknown[] = new Array<unknown>(nbColonnes).fill(null);
          for (let c = 1; c <= nbColonnes; c++) {
            ligne[c - 1] = normaliserCellule(row.getCell(c).value);
          }
          aoa.push(ligne);
        }
      }
      cache.set(nom, aoa);
      return aoa;
    },
  };
}

// ─────────────────────────────────────────────────────────────
// CSV : décodage + parsing maison
//
// exceljs.csv.read (fast-csv) ne convient pas pour les CSV produits par Excel
// FR : il force l'UTF-8 (mojibake sur du Windows-1252), ne strippe pas le BOM,
// et utilise « , » comme séparateur par défaut alors qu'Excel FR exporte en
// « ; ». On parse donc le CSV nous-mêmes pour contrôler encodage + séparateur,
// en restant fidèle à SheetJS raw:true (toutes cellules en string, vide→null).
// ─────────────────────────────────────────────────────────────

function decoderCsv(buf: Buffer): string {
  // BOM UTF-8.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString('utf8');
  }
  // BOM UTF-16 LE.
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString('utf16le');
  }
  // BOM UTF-16 BE.
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  // Sans BOM : on tente l'UTF-8 ; si des caractères de remplacement (U+FFFD)
  // apparaissent, on retombe sur Windows-1252 (cas fréquent des exports Excel FR).
  const utf8 = buf.toString('utf8');
  if (utf8.includes('�')) {
    try {
      return new TextDecoder('windows-1252').decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function detecterSeparateur(texte: string): string {
  const fin = texte.search(/\r?\n/);
  const premiere = fin === -1 ? texte : texte.slice(0, fin);
  const compte: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  let dansGuillemets = false;
  for (let i = 0; i < premiere.length; i++) {
    const ch = premiere.charAt(i);
    if (ch === '"') dansGuillemets = !dansGuillemets;
    else if (!dansGuillemets && ch in compte) compte[ch] = (compte[ch] ?? 0) + 1;
  }
  let meilleur = ',';
  let max = 0;
  for (const sep of [';', ',', '\t']) {
    const n = compte[sep] ?? 0;
    if (n > max) {
      max = n;
      meilleur = sep;
    }
  }
  return meilleur;
}

function parserCsv(buf: Buffer): unknown[][] {
  const texte = decoderCsv(buf);
  const sep = detecterSeparateur(texte);
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let dansGuillemets = false;

  for (let i = 0; i < texte.length; i++) {
    const ch = texte.charAt(i);
    if (dansGuillemets) {
      if (ch === '"') {
        if (texte.charAt(i + 1) === '"') {
          champ += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        champ += ch;
      }
    } else if (ch === '"') {
      dansGuillemets = true;
    } else if (ch === sep) {
      ligne.push(champ);
      champ = '';
    } else if (ch === '\n') {
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else if (ch === '\r') {
      // Ignoré : géré via la séquence \r\n ; un \r isolé (vieux Mac) est absorbé.
    } else {
      champ += ch;
    }
  }
  // Dernière cellule / dernière ligne si le fichier ne se termine pas par un saut.
  if (champ !== '' || ligne.length > 0) {
    ligne.push(champ);
    lignes.push(ligne);
  }

  const nbColonnes = lignes.reduce((m, r) => Math.max(m, r.length), 0);
  return lignes.map((r) =>
    Array.from({ length: nbColonnes }, (_, i) => {
      const v = r[i];
      return v === undefined || v === '' ? null : v;
    }),
  );
}

function classeurCsv(buf: Buffer): Classeur {
  const aoa = parserCsv(buf);
  const NOM = 'Feuille1';
  return {
    sheetNames: [NOM],
    feuille(nom: string): unknown[][] {
      return nom === NOM ? aoa : [];
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Détection de format par octets magiques (pour l'entrée « bytes »)
// ─────────────────────────────────────────────────────────────

/** En-tête ZIP (50 4B 03 04 = « PK.. ») : tous les .xlsx/.xlsm sont des ZIP. */
function estZip(buf: Buffer): boolean {
  return (
    buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
  );
}

/** En-tête OLE2/CFB (D0 CF 11 E0) des anciens .xls binaires. */
function estOle(buf: Buffer): boolean {
  return (
    buf.length >= 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0
  );
}

// ─────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────

/**
 * Ouvre un classeur `.xlsx` ou `.csv` passé en base64 (compatible Server
 * Action) — le format est déterminé par l'extension de `nomFichier`. Le format
 * `.xls` (binaire legacy) n'est pas pris en charge → `ClasseurFormatError`.
 */
export async function lireClasseur(base64: string, nomFichier: string): Promise<Classeur> {
  const lower = nomFichier.toLowerCase();
  if (lower.endsWith('.xls')) {
    throw new ClasseurFormatError(messageXls(nomFichier));
  }
  const buffer = Buffer.from(base64, 'base64');
  return lower.endsWith('.csv') ? classeurCsv(buffer) : classeurXlsx(buffer);
}

/**
 * Variante acceptant directement des octets (ArrayBuffer/Uint8Array) sans nom
 * de fichier : le format est déduit des octets magiques (ZIP → .xlsx, OLE →
 * .xls rejeté, sinon → CSV). Utilisé par l'import de pointages RH.
 */
export async function lireClasseurBytes(bytes: ArrayBuffer | Uint8Array): Promise<Classeur> {
  const buffer =
    bytes instanceof Uint8Array ? Buffer.from(bytes) : Buffer.from(new Uint8Array(bytes));
  if (estOle(buffer)) {
    throw new ClasseurFormatError(messageXls());
  }
  return estZip(buffer) ? classeurXlsx(buffer) : classeurCsv(buffer);
}
