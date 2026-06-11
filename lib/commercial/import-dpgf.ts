'use server';

import { requirePermission } from '@/lib/auth/guards';
import {
  estLigneTotalOuTva,
  nettoyerNombre,
  ressembleAPosition,
  trouverColonne,
} from '@/lib/facturation/import-situation-helpers';
import { lireClasseur, ClasseurFormatError, type Classeur } from '@/lib/import/classeur';

import type { ActionResult } from '@/lib/catalogue/types';

/** Permission atomique gardant les server actions DPGF — cochable via
 *  /administration/roles. Seedée par 0027_perm_import_dpgf.sql. */
const PERM_IMPORT_DPGF = 'COMMERCIAL_DEVIS_IMPORT_DPGF';

/**
 * Import d'un DPGF (Décomposition du Prix Global et Forfaitaire) — fichier
 * Excel envoyé par un prospect / économiste. Chaque DPGF a un format qui
 * lui est propre (différent par client/affaire) ; l'import procède donc en
 * 2 étapes pour rester dynamique :
 *
 *   1. `analyserClasseurDpgf` : ouvre le fichier, renvoie la liste des
 *      feuilles avec un aperçu des premières lignes, plus un mapping
 *      auto-suggéré (feuille la plus volumineuse + meilleure ligne
 *      d'en-tête + colonnes détectées). L'utilisateur peut tout corriger
 *      via la pop-up d'import.
 *
 *   2. `importerAvecMappingDpgf` : applique le mapping confirmé par
 *      l'utilisateur (feuille, ligne d'en-tête, colonnes position /
 *      désignation / unité / quantité) et renvoie la preview des lignes
 *      typées `section` ou `libre`.
 *
 * Règle : une ligne devient `section` si elle n'a pas de quantité
 * exploitable ou pas d'unité ; sinon `libre`. Aucun PU n'est repris
 * du fichier — l'utilisateur chiffrera chaque ligne via le catalogue.
 */

export type LigneDpgfPreview =
  | {
      ordre: number;
      type: 'section';
      position: string;
      designation: string;
      erreurs: string[];
    }
  | {
      ordre: number;
      type: 'libre';
      position: string;
      designation: string;
      quantite: string;
      unite: string;
      erreurs: string[];
    };

const UNITES_VALIDES = /^[A-Za-zÀ-ÿ²³µ0-9.²³/\-_ ]{1,20}$/;
const NB_LIGNES_APERCU = 25;

function normaliserUnite(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  if (!UNITES_VALIDES.test(s)) return null;
  return s;
}

function nbLignesNonVides(data: unknown[][]): number {
  return data.filter(
    (r) => r && r.some((v) => v !== null && v !== undefined && String(v).trim() !== ''),
  ).length;
}

function compterPositions(
  data: unknown[][],
  headerRowIdx: number,
  col: number,
): { positions: number; nonVide: number } {
  let positions = 0;
  let nonVide = 0;
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i] ?? [];
    const v = row[col];
    if (v === null || v === undefined || String(v).trim() === '') continue;
    nonVide++;
    if (ressembleAPosition(v)) positions++;
  }
  return { positions, nonVide };
}

/**
 * Détecte le mapping le plus plausible pour une feuille : ligne d'en-tête,
 * colonnes position / désignation / unité / quantité.
 */
function deviner(data: unknown[][]): {
  headerRow: number;
  idxPosition: number | null;
  idxDesignation: number;
  idxUnite: number | null;
  idxQuantite: number | null;
} | null {
  const maxScan = Math.min(data.length, 15);
  let headerRow = -1;
  for (let i = 0; i < maxScan; i++) {
    const row = data[i] ?? [];
    const headersCandidate = row.map((h) => String(h ?? ''));
    if (trouverColonne(headersCandidate, 'designation') !== null) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) return null;

  const headers = data[headerRow]!.map((h) => String(h ?? ''));
  let idxPosition = trouverColonne(headers, 'position');
  let idxDesignation = trouverColonne(headers, 'designation');
  const idxQuantite = trouverColonne(headers, 'quantite');
  const idxUnite = trouverColonne(headers, 'unite');

  if (idxDesignation === null) return null;

  // Heuristiques pour la colonne position non identifiée par alias :
  //   H1 : colonne juste à gauche de la désignation, en-tête vide, qui
  //        contient des `2.1.1` …
  //   H2 : la « désignation » contient en réalité les positions, et
  //        le vrai libellé est dans la colonne suivante.
  if (idxPosition === null && idxDesignation > 0) {
    const colLeft = idxDesignation - 1;
    const headerLeft = (headers[colLeft] ?? '').trim();
    if (headerLeft === '') {
      const stats = compterPositions(data, headerRow, colLeft);
      if (stats.nonVide >= 2 && stats.positions / stats.nonVide >= 0.5) {
        idxPosition = colLeft;
      }
    }
  }
  if (idxPosition === null) {
    const stats = compterPositions(data, headerRow, idxDesignation);
    if (stats.nonVide >= 2 && stats.positions / stats.nonVide >= 0.5) {
      idxPosition = idxDesignation;
      idxDesignation = idxDesignation + 1;
    }
  }

  return { headerRow, idxPosition, idxDesignation, idxUnite, idxQuantite };
}

// ─────────────────────────────────────────────────────────────
// Étape 1 — Analyse du classeur (aperçu + mapping suggéré)
// ─────────────────────────────────────────────────────────────

export type DpgfFeuilleApercu = {
  nom: string;
  nbLignes: number;
  /** Données brutes des `NB_LIGNES_APERCU` premières lignes (utile pour
   *  l'UI de mapping : permet à l'utilisateur de voir le fichier et
   *  choisir manuellement ligne d'en-tête et colonnes). */
  apercu: (string | number | null)[][];
  /** Nombre de colonnes utilisées (max sur toutes les lignes de l'aperçu). */
  nbColonnes: number;
};

export type MappingDpgfSuggere = {
  feuille: string;
  headerRow: number;
  idxPosition: number | null;
  idxDesignation: number;
  idxUnite: number | null;
  idxQuantite: number | null;
};

export type DpgfAnalyse = {
  feuilles: DpgfFeuilleApercu[];
  suggestion: MappingDpgfSuggere | null;
};

function normaliserCellule(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v);
  return s === '' ? null : s;
}

export async function analyserClasseurDpgf(
  fichierBase64: string,
  nomFichier: string,
): Promise<ActionResult<DpgfAnalyse>> {
  await requirePermission(PERM_IMPORT_DPGF);

  let classeur: Classeur;
  try {
    classeur = await lireClasseur(fichierBase64, nomFichier);
  } catch (e) {
    if (e instanceof ClasseurFormatError) return { ok: false, error: e.message };
    return { ok: false, error: `Fichier illisible : ${nomFichier}` };
  }

  if (classeur.sheetNames.length === 0) {
    return { ok: false, error: 'Le fichier ne contient aucune feuille.' };
  }

  const feuilles: DpgfFeuilleApercu[] = [];
  let meilleureSuggestion: MappingDpgfSuggere | null = null;
  let meilleurNbLignes = 0;

  for (const nom of classeur.sheetNames) {
    const data = classeur.feuille(nom);
    const nbLignes = nbLignesNonVides(data);
    const apercuRaw = data.slice(0, NB_LIGNES_APERCU);
    const nbColonnes = apercuRaw.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
    const apercu = apercuRaw.map((row) =>
      Array.from({ length: nbColonnes }, (_, i) => normaliserCellule(row?.[i] ?? null)),
    );
    feuilles.push({ nom, nbLignes, apercu, nbColonnes });

    if (nbLignes < 2) continue;
    const devine = deviner(data);
    // On garde la suggestion provenant de la feuille la plus volumineuse
    // qui contient une désignation détectable.
    if (devine && nbLignes > meilleurNbLignes) {
      meilleurNbLignes = nbLignes;
      meilleureSuggestion = {
        feuille: nom,
        headerRow: devine.headerRow,
        idxPosition: devine.idxPosition,
        idxDesignation: devine.idxDesignation,
        idxUnite: devine.idxUnite,
        idxQuantite: devine.idxQuantite,
      };
    }
  }

  return {
    ok: true,
    data: { feuilles, suggestion: meilleureSuggestion },
  };
}

// ─────────────────────────────────────────────────────────────
// Étape 2 — Application d'un mapping confirmé par l'utilisateur
// ─────────────────────────────────────────────────────────────

export type MappingDpgf = {
  feuille: string;
  headerRow: number;
  idxPosition: number | null;
  idxDesignation: number;
  idxUnite: number | null;
  idxQuantite: number | null;
};

export type DpgfImportResult = {
  lignes: LigneDpgfPreview[];
  nbSections: number;
  nbArticles: number;
  nbErreurs: number;
  feuilleUtilisee: string;
};

function valider(mapping: MappingDpgf, nbColonnes: number): string | null {
  if (!Number.isInteger(mapping.headerRow) || mapping.headerRow < 0) {
    return 'Ligne d’en-tête invalide.';
  }
  if (
    !Number.isInteger(mapping.idxDesignation) ||
    mapping.idxDesignation < 0 ||
    mapping.idxDesignation >= nbColonnes
  ) {
    return 'Colonne désignation invalide.';
  }
  for (const [nom, v] of [
    ['position', mapping.idxPosition],
    ['unité', mapping.idxUnite],
    ['quantité', mapping.idxQuantite],
  ] as const) {
    if (v === null) continue;
    if (!Number.isInteger(v) || v < 0 || v >= nbColonnes) {
      return `Colonne ${nom} invalide.`;
    }
  }
  return null;
}

export async function importerAvecMappingDpgf(
  fichierBase64: string,
  nomFichier: string,
  mapping: MappingDpgf,
): Promise<ActionResult<DpgfImportResult>> {
  await requirePermission(PERM_IMPORT_DPGF);

  let classeur: Classeur;
  try {
    classeur = await lireClasseur(fichierBase64, nomFichier);
  } catch (e) {
    if (e instanceof ClasseurFormatError) return { ok: false, error: e.message };
    return { ok: false, error: `Fichier illisible : ${nomFichier}` };
  }

  if (!classeur.sheetNames.includes(mapping.feuille)) {
    return { ok: false, error: `Feuille « ${mapping.feuille} » introuvable.` };
  }
  const data = classeur.feuille(mapping.feuille);
  const nbColonnes = data.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
  const erreurMapping = valider(mapping, nbColonnes);
  if (erreurMapping) {
    return { ok: false, error: erreurMapping };
  }
  if (mapping.headerRow >= data.length) {
    return {
      ok: false,
      error: `Ligne d’en-tête ${mapping.headerRow + 1} hors de la feuille.`,
    };
  }

  const lignes: LigneDpgfPreview[] = [];
  let nbSections = 0;
  let nbArticles = 0;
  let nbErreurs = 0;

  for (let i = mapping.headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;

    const position =
      mapping.idxPosition !== null && row[mapping.idxPosition] != null
        ? String(row[mapping.idxPosition]).trim()
        : '';
    const designationBrute = String(row[mapping.idxDesignation] ?? '').trim();
    if (designationBrute === '') continue;
    if (estLigneTotalOuTva(designationBrute)) continue;

    const quantite = mapping.idxQuantite !== null ? nettoyerNombre(row[mapping.idxQuantite]) : null;
    const unite = mapping.idxUnite !== null ? normaliserUnite(row[mapping.idxUnite]) : null;

    const qNum = quantite === null ? null : Number(quantite);
    const aQuantite = qNum !== null && Number.isFinite(qNum) && qNum > 0;
    const aUnite = unite !== null;

    // Règle "champs manquants → section" : sans quantité ET unité valides,
    // la ligne est traitée comme une section (titre / chapitre). L'utilisateur
    // peut basculer en article catalogue ou libre depuis l'éditeur.
    if (!aQuantite || !aUnite) {
      if (position === '' && designationBrute.length < 3) continue;
      const erreurs: string[] = [];
      const limite = designationBrute.slice(0, 200);
      lignes.push({
        ordre: lignes.length,
        type: 'section',
        position,
        designation: limite,
        erreurs,
      });
      nbSections++;
      continue;
    }

    const erreurs: string[] = [];
    if (designationBrute.length > 500) {
      erreurs.push('Désignation > 500 caractères (tronquée)');
    }

    lignes.push({
      ordre: lignes.length,
      type: 'libre',
      position,
      designation: designationBrute.slice(0, 500),
      quantite: quantite!,
      unite: unite!,
      erreurs,
    });
    if (erreurs.length > 0) nbErreurs++;
    else nbArticles++;
  }

  if (lignes.length === 0) {
    return { ok: false, error: 'Aucune ligne exploitable trouvée avec ce mapping.' };
  }

  return {
    ok: true,
    data: {
      lignes,
      nbSections,
      nbArticles,
      nbErreurs,
      feuilleUtilisee: mapping.feuille,
    },
  };
}
