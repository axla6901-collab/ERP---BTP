/**
 * Helpers PURS (sans I/O, sans accès base) pour le référentiel des codes
 * postaux : parsing du CSV officiel La Poste (laposte-hexasmal), dérivation du
 * département et normalisation du nom de commune pour la recherche.
 *
 * Isolés ici pour être testés unitairement et réutilisés par le script de
 * génération du seed (`scripts/generate-codes-postaux-seed.ts`).
 */

/** Une ligne brute du CSV La Poste, après mapping des colonnes. */
export type LigneHexasmal = {
  codeCommuneInsee: string;
  commune: string;
  codePostal: string;
  libelleAcheminement: string;
  ligne5: string | null;
};

/** Une ligne prête à être insérée dans `codes_postaux`. */
export type CodePostalSeed = {
  codePostal: string;
  codeCommuneInsee: string;
  commune: string;
  libelleAcheminement: string;
  ligne5: string | null;
  departement: string;
  latitude: number | null;
  longitude: number | null;
  recherche: string;
};

/**
 * Abréviations La Poste utilisées dans les noms de commune (« ST ETIENNE »,
 * « STE FOY »…). On les déplie côté recherche pour qu'une saisie en toutes
 * lettres (« Saint-Étienne ») retrouve la commune.
 */
const ABREVIATIONS_LA_POSTE: Record<string, string> = {
  ST: 'SAINT',
  STE: 'SAINTE',
  STS: 'SAINTS',
  STES: 'SAINTES',
};

/**
 * Normalise un libellé de commune pour la recherche par préfixe : majuscules,
 * sans accent, ponctuation remplacée par une espace, espaces réduits, puis
 * dépliage des abréviations La Poste. « Saint-Étienne » et « ST ETIENNE »
 * donnent tous deux « SAINT ETIENNE ». Appliquée à la fois à la valeur stockée
 * et au terme saisi → recherche symétrique.
 */
export function normaliserRecherche(valeur: string): string {
  const base = valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  if (base === '') return base;
  return base
    .split(' ')
    .map((token) => ABREVIATIONS_LA_POSTE[token] ?? token)
    .join(' ');
}

/**
 * Dérive le code département à partir du code commune INSEE (5 caractères).
 * - DOM/COM : codes commençant par 97/98 → 3 caractères (971, 972, …).
 * - Corse : 2A / 2B → 2 caractères (le code INSEE commence déjà par 2A/2B).
 * - Métropole : 2 premiers chiffres.
 */
export function departementFromInsee(codeInsee: string): string {
  const code = codeInsee.trim().toUpperCase();
  if (code.startsWith('97') || code.startsWith('98')) return code.slice(0, 3);
  return code.slice(0, 2);
}

/** Découpe une ligne CSV en respectant des champs éventuellement entre guillemets. */
function decouperLigne(ligne: string, separateur: string): string[] {
  // Cas simple et ultra-majoritaire pour ce fichier : aucun guillemet.
  if (!ligne.includes('"')) return ligne.split(separateur);

  const champs: string[] = [];
  let courant = '';
  let entreGuillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') {
      if (entreGuillemets && ligne[i + 1] === '"') {
        courant += '"';
        i++;
      } else {
        entreGuillemets = !entreGuillemets;
      }
    } else if (c === separateur && !entreGuillemets) {
      champs.push(courant);
      courant = '';
    } else {
      courant += c;
    }
  }
  champs.push(courant);
  return champs;
}

/**
 * Décode des octets CSV en chaîne. Le fichier La Poste (laposte-hexasmal) est
 * encodé en **Latin‑1** (l'en-tête « Libellé » contient l'octet 0xE9), pas en
 * UTF‑8. Stratégie : décoder en UTF‑8 ; si le résultat contient le caractère de
 * remplacement U+FFFD (octet non valide en UTF‑8), retomber sur latin1. Gère
 * aussi un éventuel BOM UTF‑8. `TextDecoder` est universel (Node + navigateur).
 */
export function decoderCsv(octets: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(octets);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  return new TextDecoder('latin1').decode(octets);
}

/** Normalise un nom d'en-tête de colonne (sans accent, minuscules, snake_case). */
function normaliserEntete(entete: string): string {
  return entete
    .replace(/^﻿/, '') // BOM
    .replace(/^#/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Parse le CSV officiel La Poste (laposte-hexasmal). Mappe les colonnes par
 * leur nom normalisé pour tolérer les variantes de casse/accents :
 *   code_commune_insee ; nom_de_la_commune ; code_postal ;
 *   libelle_d_acheminement ; ligne_5
 * Le séparateur (`;` par défaut) est auto-détecté sur l'en-tête.
 */
export function parseHexasmalCsv(contenu: string): LigneHexasmal[] {
  const lignes = contenu.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lignes.length === 0) return [];

  const enteteBrute = lignes[0]!;
  const separateur =
    (enteteBrute.match(/;/g)?.length ?? 0) >= (enteteBrute.match(/,/g)?.length ?? 0) ? ';' : ',';

  const entetes = decouperLigne(enteteBrute, separateur).map(normaliserEntete);
  // Recherche par mot-clé (et non égalité stricte) : robuste aux variantes de
  // nommage et à un éventuel artefact d'encodage sur l'en-tête « Libellé ».
  const trouver = (predicat: (h: string) => boolean) => entetes.findIndex(predicat);
  const iInsee = trouver((h) => h.includes('insee'));
  const iNom = trouver((h) => h.includes('nom') && h.includes('commune'));
  const iCp = trouver((h) => h.includes('postal'));
  const iLibelle = trouver((h) => h.includes('acheminement'));
  const iLigne5 = trouver((h) => h.startsWith('ligne'));

  if (iInsee < 0 || iNom < 0 || iCp < 0 || iLibelle < 0) {
    throw new Error(
      `En-tête CSV inattendu : colonnes attendues introuvables (reçu : ${entetes.join(', ')})`,
    );
  }

  const resultat: LigneHexasmal[] = [];
  for (let i = 1; i < lignes.length; i++) {
    const champs = decouperLigne(lignes[i]!, separateur);
    const codePostal = (champs[iCp] ?? '').trim();
    const codeCommuneInsee = (champs[iInsee] ?? '').trim();
    if (codePostal === '' || codeCommuneInsee === '') continue;
    const ligne5 = iLigne5 >= 0 ? (champs[iLigne5] ?? '').trim() : '';
    resultat.push({
      codeCommuneInsee,
      commune: (champs[iNom] ?? '').trim(),
      codePostal,
      libelleAcheminement: (champs[iLibelle] ?? '').trim(),
      ligne5: ligne5 === '' ? null : ligne5,
    });
  }
  return resultat;
}

/**
 * Transforme une ligne brute en ligne de seed (département dérivé, recherche
 * normalisée, coordonnées optionnelles fournies par l'enrichissement geo).
 */
export function versSeed(
  ligne: LigneHexasmal,
  coords?: { latitude: number; longitude: number } | null,
): CodePostalSeed {
  return {
    codePostal: ligne.codePostal,
    codeCommuneInsee: ligne.codeCommuneInsee,
    commune: ligne.commune,
    libelleAcheminement: ligne.libelleAcheminement || ligne.commune,
    ligne5: ligne.ligne5,
    departement: departementFromInsee(ligne.codeCommuneInsee),
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    recherche: normaliserRecherche(ligne.commune || ligne.libelleAcheminement),
  };
}

/** Échappe un champ pour un bloc `COPY ... FROM stdin` (format texte). */
function echapperCopy(valeur: string | null): string {
  if (valeur === null) return '\\N';
  return valeur
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/** Sérialise une ligne de seed en ligne TSV pour `COPY` (ordre des colonnes figé). */
export function versLigneCopy(seed: CodePostalSeed): string {
  return [
    echapperCopy(seed.codePostal),
    echapperCopy(seed.codeCommuneInsee),
    echapperCopy(seed.commune),
    echapperCopy(seed.libelleAcheminement),
    echapperCopy(seed.ligne5),
    echapperCopy(seed.departement),
    seed.latitude === null ? '\\N' : String(seed.latitude),
    seed.longitude === null ? '\\N' : String(seed.longitude),
    echapperCopy(seed.recherche),
  ].join('\t');
}

/** Colonnes du bloc COPY, dans l'ordre attendu par {@link versLigneCopy}. */
export const COLONNES_COPY = [
  'code_postal',
  'code_commune_insee',
  'commune',
  'libelle_acheminement',
  'ligne_5',
  'departement',
  'latitude',
  'longitude',
  'recherche',
] as const;
