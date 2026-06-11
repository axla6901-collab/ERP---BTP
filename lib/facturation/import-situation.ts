'use server';

import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { lireClasseur, ClasseurFormatError, type Classeur } from '@/lib/import/classeur';

import {
  estLigneTotalOuTva,
  nettoyerNombre,
  normaliserPct,
  ressembleAPosition,
  trouverColonne,
} from './import-situation-helpers';
import { ROLES_FACTURATION_WRITE } from './permissions';
import type { ActionResult } from './types';

/**
 * Une ligne preview après parse — toutes les valeurs sont des strings (telles
 * que lues du fichier). La validation Zod stricte aura lieu plus tard, lors
 * de la sauvegarde de la situation.
 *
 * Colonnes reconnues (alias gérés par `ALIAS_COLONNES` dans le module helpers,
 * insensibles à la casse et aux accents) :
 *   - designation | libelle | poste | description
 *   - quantite | qte | qty
 *   - unite | u
 *   - prixUnitaireHt | pu | "prix unitaire" | "p.u. ht"
 *   - montantMarcheHt | montant | "montant marché" | "montant ht" | total
 *   - pctAvancementCumule | pct | "%" | "avancement" | "pourcentage"
 *   - notes | commentaire
 */
export type LignePreview = {
  ordre: number;
  designation: string;
  quantite: string | null;
  unite: string | null;
  prixUnitaireHt: string | null;
  montantMarcheHt: string | null;
  pctAvancementCumule: string | null;
  notes: string | null;
  /** Erreurs détectées sur cette ligne (vides si OK). */
  erreurs: string[];
};

/**
 * Parse un fichier Excel ou CSV et retourne une preview des lignes parsées.
 * Le contenu n'est PAS persisté — l'utilisateur valide ensuite via le form.
 *
 * Le fichier est passé en bytes encodés base64 (compatible Server Action).
 */
export async function parserFichierSituation(
  fichierBase64: string,
  nomFichier: string,
): Promise<
  ActionResult<{
    lignes: LignePreview[];
    nbLignesValides: number;
    nbLignesErreurs: number;
  }>
> {
  await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);

  let classeur: Classeur;
  try {
    classeur = await lireClasseur(fichierBase64, nomFichier);
  } catch (e) {
    if (e instanceof ClasseurFormatError) return { ok: false, error: e.message };
    return { ok: false, error: `Fichier illisible : ${nomFichier}` };
  }

  const sheetName = classeur.sheetNames[0];
  if (!sheetName) {
    return { ok: false, error: 'Le fichier ne contient aucune feuille.' };
  }
  const data = classeur.feuille(sheetName);

  if (data.length < 2) {
    return {
      ok: false,
      error: 'Le fichier doit contenir au moins une ligne d’en-tête + une ligne de données.',
    };
  }

  // Détection automatique de la ligne d'en-tête : on cherche dans les 10
  // premières lignes celle qui contient au minimum une colonne « désignation »
  // ET une colonne « % avancement » (ou « montant ») reconnues via alias.
  // Indispensable pour les modèles avec titre/sous-titre au-dessus de l'en-tête.
  let headerRowIdx = -1;
  const maxScan = Math.min(data.length, 10);
  for (let i = 0; i < maxScan; i++) {
    const row = (data[i] as unknown[]) ?? [];
    const headersCandidate = row.map((h) => String(h ?? ''));
    const hasDes = trouverColonne(headersCandidate, 'designation') !== null;
    const hasPct = trouverColonne(headersCandidate, 'pctAvancementCumule') !== null;
    const hasMontant = trouverColonne(headersCandidate, 'montantMarcheHt') !== null;
    if (hasDes && (hasPct || hasMontant)) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) {
    return {
      ok: false,
      error:
        'Ligne d’en-tête introuvable. Le fichier doit contenir au moins une colonne « Désignation » et une colonne « % avancement » ou « Montant ».',
    };
  }

  const headers = (data[headerRowIdx] as unknown[]).map((h) => String(h ?? ''));
  let idxPosition = trouverColonne(headers, 'position');
  let idxDesignation = trouverColonne(headers, 'designation');
  const idxQuantite = trouverColonne(headers, 'quantite');
  const idxUnite = trouverColonne(headers, 'unite');
  const idxPu = trouverColonne(headers, 'prixUnitaireHt');
  const idxMontant = trouverColonne(headers, 'montantMarcheHt');
  const idxPct = trouverColonne(headers, 'pctAvancementCumule');
  const idxNotes = trouverColonne(headers, 'notes');

  if (idxDesignation === null) {
    return {
      ok: false,
      error:
        'Colonne « Désignation » introuvable. Renommez-la (alias acceptés : libelle, poste, description).',
    };
  }
  if (idxPct === null) {
    return {
      ok: false,
      error: 'Colonne « % avancement » introuvable. Alias acceptés : pct, avancement, pourcentage.',
    };
  }
  if (idxMontant === null && (idxQuantite === null || idxPu === null)) {
    return {
      ok: false,
      error:
        'Renseignez soit une colonne « Montant HT », soit deux colonnes « Quantité » + « Prix unitaire HT ».',
    };
  }

  // Heuristiques pour repérer la colonne « position » sans en-tête :
  //   H1. Colonne juste à gauche de la désignation : en-tête vide + valeurs
  //       qui ressemblent à `2.1.1` → c'est la colonne position (cas DPGF
  //       d'économiste).
  //   H2. Colonne désignation elle-même : si ≥ 50 % de ses valeurs sont des
  //       positions, alors elle contient la position et la vraie désignation
  //       est dans la colonne suivante (cas situation : en-tête "DESIGNATION"
  //       mais contenu type `2.1.1`).
  function compterPositionsLocal(col: number): { positions: number; nonVide: number } {
    let positions = 0;
    let nonVide = 0;
    for (let i = headerRowIdx + 1; i < data.length; i++) {
      const row = (data[i] as unknown[]) ?? [];
      const v = row[col];
      if (v === null || v === undefined || String(v).trim() === '') continue;
      nonVide++;
      if (ressembleAPosition(v)) positions++;
    }
    return { positions, nonVide };
  }

  if (idxPosition === null && idxDesignation > 0) {
    const colLeft = idxDesignation - 1;
    const headerLeft = (headers[colLeft] ?? '').trim();
    if (headerLeft === '') {
      const stats = compterPositionsLocal(colLeft);
      if (stats.nonVide >= 2 && stats.positions / stats.nonVide >= 0.5) {
        idxPosition = colLeft;
      }
    }
  }
  if (idxPosition === null) {
    const stats = compterPositionsLocal(idxDesignation);
    if (stats.nonVide >= 2 && stats.positions / stats.nonVide >= 0.5) {
      idxPosition = idxDesignation;
      idxDesignation = idxDesignation + 1;
    }
  }

  const lignes: LignePreview[] = [];
  let nbValides = 0;
  let nbErreurs = 0;

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row || row.length === 0) continue;

    const position =
      idxPosition !== null && row[idxPosition] != null ? String(row[idxPosition]).trim() : '';
    const designationBrute = String(row[idxDesignation] ?? '').trim();
    if (designationBrute === '') continue;

    // Lignes structurelles à ignorer (sous-totaux, totaux, TVA…)
    if (estLigneTotalOuTva(designationBrute)) continue;

    const designation = position ? `${position} ${designationBrute}` : designationBrute;

    const quantite = idxQuantite !== null ? nettoyerNombre(row[idxQuantite]) : null;
    const unite =
      idxUnite !== null && row[idxUnite] != null && String(row[idxUnite]).trim() !== ''
        ? String(row[idxUnite]).trim()
        : null;
    const prixUnitaireHt = idxPu !== null ? nettoyerNombre(row[idxPu]) : null;
    const montantMarcheHt = idxMontant !== null ? nettoyerNombre(row[idxMontant]) : null;
    const pctBrut = normaliserPct(idxPct !== null ? nettoyerNombre(row[idxPct]) : null);
    const notes =
      idxNotes !== null && row[idxNotes] != null && String(row[idxNotes]).trim() !== ''
        ? String(row[idxNotes]).trim()
        : null;

    const aMontantDirect = montantMarcheHt !== null && Number(montantMarcheHt) > 0;
    const aQtyPu =
      quantite !== null &&
      prixUnitaireHt !== null &&
      Number(quantite) > 0 &&
      Number(prixUnitaireHt) >= 0;

    // Ligne de chapitre / sous-chapitre (DPGF) : position présente, désignation
    // présente, mais aucun montant, aucune quantité, aucun avancement. Pas une
    // ligne à facturer — on l'ignore silencieusement plutôt que de la marquer
    // en erreur, sinon l'aperçu d'un fichier de 400 lignes serait illisible.
    if (!aMontantDirect && !aQtyPu && pctBrut === null) continue;

    const erreurs: string[] = [];

    // Si on a un montant mais pas d'avancement déclaré, on considère 0 %.
    const pct = pctBrut === null ? '0' : pctBrut;

    const pn = Number(pct);
    if (!Number.isFinite(pn) || pn < 0 || pn > 100) {
      erreurs.push('% avancement invalide (0 à 100)');
    }

    if (!aMontantDirect && !aQtyPu) {
      erreurs.push('Renseignez un montant OU (quantité + PU)');
    }

    if (erreurs.length > 0) nbErreurs++;
    else nbValides++;

    lignes.push({
      ordre: lignes.length,
      designation,
      quantite,
      unite,
      prixUnitaireHt,
      montantMarcheHt,
      pctAvancementCumule: pct,
      notes,
      erreurs,
    });
  }

  if (lignes.length === 0) {
    return { ok: false, error: 'Aucune ligne exploitable trouvée dans le fichier.' };
  }

  return {
    ok: true,
    data: { lignes, nbLignesValides: nbValides, nbLignesErreurs: nbErreurs },
  };
}
