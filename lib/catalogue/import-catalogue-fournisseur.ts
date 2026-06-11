'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requirePermission } from '@/lib/auth/guards';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import {
  articles,
  familles,
  fournisseurs,
  grilleTarifaireLignes,
  grillesTarifaires,
  unites,
} from '@/db/schema/catalogue';
import { nettoyerNombre, normaliserCle } from '@/lib/facturation/import-situation-helpers';
import { lireClasseur, ClasseurFormatError, type Classeur } from '@/lib/import/classeur';

import type { ActionResult } from './types';

/**
 * Import d'une base d'articles + prix fournisseur (Excel) depuis la fiche
 * d'un fournisseur. Pattern à 3 étapes inspiré de l'import DPGF :
 *
 *   1. `analyserClasseurCatalogue` : ouvre le fichier, renvoie un aperçu
 *      de chaque feuille + un mapping auto-suggéré (feuille volumineuse +
 *      ligne d'en-tête contenant à la fois "code" et "libellé/désignation",
 *      colonnes reconnues par alias).
 *
 *   2. `previewImportCatalogue` : applique le mapping confirmé, parse les
 *      lignes et confronte au catalogue existant pour distinguer :
 *        - lignes nouvelles (article à créer)
 *        - doublons (code déjà connu → l'article reste, le prix est ajouté
 *          quand même à la nouvelle grille)
 *        - lignes en erreur (validation)
 *      + remonte la liste des familles et unités à créer à la volée.
 *
 *   3. `executerImportCatalogue` : transaction unique qui crée
 *        - les familles manquantes (parent NULL, libelle = code)
 *        - les unités manquantes (type 'autre', code dérivé du symbole)
 *        - les articles nouveaux (type 'simple', triple unité identique)
 *        - une grille tarifaire pour le fournisseur
 *        - les lignes de grille (1 par article avec prix + unité valides)
 *
 * Limitations connues MVP : type article forcé à 'simple', triple unité
 * (achat/stock/vente) identique, période de validité fixée au niveau de la
 * grille (pas par ligne). Suffisant pour les tarifs négociés annuels typiques
 * en BTP (POINT.P, CEDEO, TÉRÉVA…).
 */

const PERM_IMPORT = 'CATALOGUE_IMPORT_FOURNISSEUR';
const NB_LIGNES_APERCU = 25;

// ─────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────

export type MappingCatalogue = {
  feuille: string;
  headerRow: number;
  /** Obligatoires. */
  idxCode: number;
  idxLibelle: number;
  /** Optionnels — null = colonne non utilisée. */
  idxFamille: number | null;
  idxUnite: number | null;
  idxPrix: number | null;
  idxReferenceFournisseur: number | null;
  idxDescription: number | null;
};

export type FeuilleApercu = {
  nom: string;
  nbLignes: number;
  apercu: (string | number | null)[][];
  nbColonnes: number;
};

export type CatalogueAnalyse = {
  feuilles: FeuilleApercu[];
  suggestion: MappingCatalogue | null;
};

export type LigneCataloguePreview = {
  ordre: number;
  code: string;
  libelle: string;
  famille: string | null;
  unite: string | null;
  prix: string | null;
  referenceFournisseur: string | null;
  description: string | null;
  /** True si un article du même code existe déjà dans le tenant. */
  doublon: boolean;
  erreurs: string[];
};

export type CataloguePreviewResult = {
  lignes: LigneCataloguePreview[];
  /** Codes famille présents dans le fichier, absents du catalogue (à créer). */
  famillesACreer: string[];
  /** Symboles unité présents dans le fichier, absents du référentiel. */
  unitesACreer: string[];
  nbDoublons: number;
  nbErreurs: number;
  nbNouveaux: number;
  feuilleUtilisee: string;
};

export type ImportInfosGrille = {
  libelle: string;
  validFrom: string;
  validTo: string | null;
};

export type CatalogueImportResult = {
  grilleId: string;
  nbArticlesCrees: number;
  nbArticlesDejaExistants: number;
  nbLignesGrille: number;
  nbFamillesCreees: number;
  nbUnitesCreees: number;
};

// ─────────────────────────────────────────────────────────────
// Aliases d'en-tête + détection
// ─────────────────────────────────────────────────────────────

const ALIAS_CATALOGUE = {
  code: ['code', 'codearticle', 'ref', 'reference', 'refinterne', 'sku'],
  libelle: ['libelle', 'designation', 'denomination', 'nom', 'article', 'intitule', 'produit'],
  famille: ['famille', 'categorie', 'category', 'rubrique', 'groupe', 'gamme'],
  unite: ['unite', 'u', 'unit', 'um'],
  prix: ['prixunitaireht', 'prixht', 'puht', 'pu', 'prix', 'tarif', 'prixunitaire', 'unitprice'],
  referenceFournisseur: [
    'referencefournisseur',
    'reffournisseur',
    'reffrn',
    'refmarque',
    'codefournisseur',
    'codefrn',
    'codeproduit',
  ],
  description: ['description', 'commentaire', 'detail', 'remarque'],
} as const;

function trouverColonneCatalogue(
  headers: string[],
  cle: keyof typeof ALIAS_CATALOGUE,
): number | null {
  const aliases = ALIAS_CATALOGUE[cle] as readonly string[];
  for (let i = 0; i < headers.length; i++) {
    const norm = normaliserCle(headers[i] ?? '');
    if (aliases.includes(norm)) return i;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Helpers parsing
// ─────────────────────────────────────────────────────────────

function nbLignesNonVides(data: unknown[][]): number {
  return data.filter(
    (r) => r && r.some((v) => v !== null && v !== undefined && String(v).trim() !== ''),
  ).length;
}

function normaliserCellule(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v);
  return s === '' ? null : s;
}

function texteOuNull(v: unknown, maxLength: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === '') return null;
  return s.slice(0, maxLength);
}

const CODE_REGEX = /^[A-Z0-9._-]{2,32}$/;

function normaliserCode(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, '_');
  if (s === '') return null;
  return s;
}

// ─────────────────────────────────────────────────────────────
// Étape 1 — Analyse du classeur
// ─────────────────────────────────────────────────────────────

export async function analyserClasseurCatalogue(
  fichierBase64: string,
  nomFichier: string,
): Promise<ActionResult<CatalogueAnalyse>> {
  await requirePermission(PERM_IMPORT);

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

  const feuilles: FeuilleApercu[] = [];
  let meilleureSuggestion: MappingCatalogue | null = null;
  let meilleurNbLignes = 0;

  for (const nom of classeur.sheetNames) {
    const data = classeur.feuille(nom);
    const nbLignes = nbLignesNonVides(data);
    const apercuRaw = data.slice(0, NB_LIGNES_APERCU);
    const nbColonnes = apercuRaw.reduce((m, r) => Math.max(m, r?.length ?? 0), 0);
    const apercu = apercuRaw.map((row) =>
      Array.from({ length: nbColonnes }, (_, i) => normaliserCellule(row?.[i] ?? null)),
    );
    feuilles.push({ nom, nbLignes, apercu, nbColonnes });

    if (nbLignes < 2) continue;

    // Cherche la première ligne contenant à la fois une colonne code et libellé.
    let headerRow = -1;
    const maxScan = Math.min(data.length, 15);
    for (let i = 0; i < maxScan; i++) {
      const row = data[i] ?? [];
      const h = row.map((v) => String(v ?? ''));
      const idxCode = trouverColonneCatalogue(h, 'code');
      const idxLibelle = trouverColonneCatalogue(h, 'libelle');
      if (idxCode !== null && idxLibelle !== null && idxCode !== idxLibelle) {
        headerRow = i;
        break;
      }
    }
    if (headerRow === -1) continue;

    const h = (data[headerRow] ?? []).map((v) => String(v ?? ''));
    const idxCode = trouverColonneCatalogue(h, 'code');
    const idxLibelle = trouverColonneCatalogue(h, 'libelle');
    if (idxCode === null || idxLibelle === null) continue;

    if (nbLignes > meilleurNbLignes) {
      meilleurNbLignes = nbLignes;
      meilleureSuggestion = {
        feuille: nom,
        headerRow,
        idxCode,
        idxLibelle,
        idxFamille: trouverColonneCatalogue(h, 'famille'),
        idxUnite: trouverColonneCatalogue(h, 'unite'),
        idxPrix: trouverColonneCatalogue(h, 'prix'),
        idxReferenceFournisseur: trouverColonneCatalogue(h, 'referenceFournisseur'),
        idxDescription: trouverColonneCatalogue(h, 'description'),
      };
    }
  }

  return { ok: true, data: { feuilles, suggestion: meilleureSuggestion } };
}

// ─────────────────────────────────────────────────────────────
// Étape 2 — Preview (lookup en base pour repérer doublons + nouveaux référentiels)
// ─────────────────────────────────────────────────────────────

function validerMapping(
  mapping: MappingCatalogue,
  nbColonnes: number,
  nbLignes: number,
): string | null {
  if (!Number.isInteger(mapping.headerRow) || mapping.headerRow < 0) {
    return "Ligne d'en-tête invalide.";
  }
  if (mapping.headerRow >= nbLignes) {
    return `Ligne d'en-tête ${mapping.headerRow + 1} hors de la feuille.`;
  }
  const requis: Array<[string, number]> = [
    ['Code', mapping.idxCode],
    ['Libellé', mapping.idxLibelle],
  ];
  for (const [label, v] of requis) {
    if (!Number.isInteger(v) || v < 0 || v >= nbColonnes) {
      return `Colonne ${label} invalide.`;
    }
  }
  if (mapping.idxCode === mapping.idxLibelle) {
    return 'Les colonnes Code et Libellé doivent être différentes.';
  }
  const optionnelles: Array<[string, number | null]> = [
    ['Famille', mapping.idxFamille],
    ['Unité', mapping.idxUnite],
    ['Prix', mapping.idxPrix],
    ['Réf. fournisseur', mapping.idxReferenceFournisseur],
    ['Description', mapping.idxDescription],
  ];
  for (const [label, v] of optionnelles) {
    if (v === null) continue;
    if (!Number.isInteger(v) || v < 0 || v >= nbColonnes) {
      return `Colonne ${label} invalide.`;
    }
  }
  return null;
}

type LigneBrute = {
  ordre: number;
  code: string | null;
  libelle: string | null;
  famille: string | null;
  unite: string | null;
  prix: string | null;
  referenceFournisseur: string | null;
  description: string | null;
};

function parserLignes(data: unknown[][], mapping: MappingCatalogue): LigneBrute[] {
  const out: LigneBrute[] = [];
  for (let i = mapping.headerRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    const codeBrut = row[mapping.idxCode];
    const libelleBrut = row[mapping.idxLibelle];
    const codeVide = codeBrut === null || codeBrut === undefined || String(codeBrut).trim() === '';
    const libelleVide =
      libelleBrut === null || libelleBrut === undefined || String(libelleBrut).trim() === '';
    if (codeVide && libelleVide) continue;

    out.push({
      ordre: out.length,
      code: normaliserCode(codeBrut),
      libelle: texteOuNull(libelleBrut, 200),
      famille: mapping.idxFamille !== null ? texteOuNull(row[mapping.idxFamille], 100) : null,
      unite: mapping.idxUnite !== null ? texteOuNull(row[mapping.idxUnite], 10) : null,
      prix: mapping.idxPrix !== null ? nettoyerNombre(row[mapping.idxPrix]) : null,
      referenceFournisseur:
        mapping.idxReferenceFournisseur !== null
          ? texteOuNull(row[mapping.idxReferenceFournisseur], 100)
          : null,
      description:
        mapping.idxDescription !== null ? texteOuNull(row[mapping.idxDescription], 2000) : null,
    });
  }
  return out;
}

export async function previewImportCatalogue(
  fichierBase64: string,
  nomFichier: string,
  mapping: MappingCatalogue,
): Promise<ActionResult<CataloguePreviewResult>> {
  await requirePermission(PERM_IMPORT);
  const { entreprise } = await requireTenantContextWithMfa();

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
  const nbColonnes = data.reduce((m, r) => Math.max(m, r?.length ?? 0), 0);
  const erreurMapping = validerMapping(mapping, nbColonnes, data.length);
  if (erreurMapping) return { ok: false, error: erreurMapping };

  const lignesBrutes = parserLignes(data, mapping);
  if (lignesBrutes.length === 0) {
    return { ok: false, error: 'Aucune ligne exploitable trouvée avec ce mapping.' };
  }

  const codesArticles = Array.from(
    new Set(lignesBrutes.map((l) => l.code).filter((c): c is string => c !== null)),
  );
  const codesFamilles = Array.from(
    new Set(lignesBrutes.map((l) => l.famille?.toUpperCase().trim() ?? '').filter((c) => c !== '')),
  );
  const symbolesUnites = Array.from(
    new Set(lignesBrutes.map((l) => l.unite?.trim() ?? '').filter((u) => u !== '')),
  );

  const { articlesExistants, famillesExistantes, unitesExistantes } = await withTenant(
    entreprise.id,
    async (tx) => {
      const [articlesRows, famillesRows, unitesRows] = await Promise.all([
        codesArticles.length > 0
          ? tx
              .select({ code: articles.code })
              .from(articles)
              .where(and(inArray(articles.code, codesArticles), isNull(articles.deletedAt)))
          : Promise.resolve([] as Array<{ code: string }>),
        codesFamilles.length > 0
          ? tx
              .select({ code: familles.code })
              .from(familles)
              .where(and(inArray(familles.code, codesFamilles), isNull(familles.deletedAt)))
          : Promise.resolve([] as Array<{ code: string }>),
        symbolesUnites.length > 0
          ? tx
              .select({ symbole: unites.symbole })
              .from(unites)
              .where(and(inArray(unites.symbole, symbolesUnites), isNull(unites.deletedAt)))
          : Promise.resolve([] as Array<{ symbole: string }>),
      ]);
      return {
        articlesExistants: new Set(articlesRows.map((r) => r.code)),
        famillesExistantes: new Set(famillesRows.map((r) => r.code.toUpperCase())),
        unitesExistantes: new Set(unitesRows.map((r) => r.symbole)),
      };
    },
  );

  const codesDejaVus = new Set<string>();
  const lignes: LigneCataloguePreview[] = [];
  const famillesACreer = new Set<string>();
  const unitesACreer = new Set<string>();
  let nbDoublons = 0;
  let nbErreurs = 0;
  let nbNouveaux = 0;

  for (const l of lignesBrutes) {
    const erreurs: string[] = [];
    if (l.code === null) erreurs.push('Code manquant');
    else if (!CODE_REGEX.test(l.code)) {
      erreurs.push('Code invalide (lettres/chiffres/.-_, 2 à 32 caractères)');
    }
    if (l.libelle === null) erreurs.push('Libellé manquant');
    if (l.prix !== null) {
      const n = Number(l.prix);
      if (!Number.isFinite(n) || n < 0) erreurs.push('Prix invalide');
    }

    const codeNorm = l.code;
    const doublon = codeNorm !== null && articlesExistants.has(codeNorm);
    if (codeNorm !== null) {
      if (codesDejaVus.has(codeNorm)) erreurs.push('Code dupliqué dans le fichier');
      codesDejaVus.add(codeNorm);
    }

    if (erreurs.length === 0) {
      if (l.famille && l.famille.trim() !== '') {
        const fu = l.famille.toUpperCase().trim();
        if (!famillesExistantes.has(fu)) famillesACreer.add(fu);
      }
      if (l.unite && l.unite.trim() !== '') {
        if (!unitesExistantes.has(l.unite.trim())) unitesACreer.add(l.unite.trim());
      }
    }

    if (erreurs.length > 0) nbErreurs++;
    else if (doublon) nbDoublons++;
    else nbNouveaux++;

    lignes.push({
      ordre: l.ordre,
      code: l.code ?? '',
      libelle: l.libelle ?? '',
      famille: l.famille,
      unite: l.unite,
      prix: l.prix,
      referenceFournisseur: l.referenceFournisseur,
      description: l.description,
      doublon,
      erreurs,
    });
  }

  return {
    ok: true,
    data: {
      lignes,
      famillesACreer: Array.from(famillesACreer).sort(),
      unitesACreer: Array.from(unitesACreer).sort(),
      nbDoublons,
      nbErreurs,
      nbNouveaux,
      feuilleUtilisee: mapping.feuille,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Étape 3 — Exécution (insertion DB en transaction)
// ─────────────────────────────────────────────────────────────

export async function executerImportCatalogue(
  fichierBase64: string,
  nomFichier: string,
  mapping: MappingCatalogue,
  fournisseurId: string,
  infosGrille: ImportInfosGrille,
): Promise<ActionResult<CatalogueImportResult>> {
  await requirePermission(PERM_IMPORT);
  const ctx = await requireTenantContextWithMfa();

  if (!infosGrille.libelle || infosGrille.libelle.trim().length < 2) {
    return { ok: false, error: 'Libellé de la grille requis (min 2 caractères).' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(infosGrille.validFrom)) {
    return { ok: false, error: 'Date de début de validité invalide (YYYY-MM-DD).' };
  }
  if (infosGrille.validTo !== null && !/^\d{4}-\d{2}-\d{2}$/.test(infosGrille.validTo)) {
    return { ok: false, error: 'Date de fin de validité invalide.' };
  }
  if (infosGrille.validTo && infosGrille.validTo < infosGrille.validFrom) {
    return { ok: false, error: 'Date de fin antérieure à la date de début.' };
  }

  const previewRes = await previewImportCatalogue(fichierBase64, nomFichier, mapping);
  if (!previewRes.ok) return previewRes;
  const preview = previewRes.data;

  const lignesValides = preview.lignes.filter((l) => l.erreurs.length === 0);
  if (lignesValides.length === 0) {
    return { ok: false, error: 'Aucune ligne valide à importer.' };
  }

  try {
    const result = await withTenant(ctx.entreprise.id, async (tx) => {
      const [fourn] = await tx
        .select({ id: fournisseurs.id })
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, fournisseurId), isNull(fournisseurs.deletedAt)))
        .limit(1);
      if (!fourn) throw new Error('FOURNISSEUR_NOT_FOUND');

      // ── 1. Familles : récupère existantes + crée les manquantes ──
      const codesFamilles = Array.from(
        new Set(
          lignesValides.map((l) => l.famille?.toUpperCase().trim() ?? '').filter((c) => c !== ''),
        ),
      );
      const familleIdByCode = new Map<string, string>();
      if (codesFamilles.length > 0) {
        const existantes = await tx
          .select({ id: familles.id, code: familles.code })
          .from(familles)
          .where(and(inArray(familles.code, codesFamilles), isNull(familles.deletedAt)));
        for (const f of existantes) familleIdByCode.set(f.code.toUpperCase(), f.id);
      }
      let nbFamillesCreees = 0;
      for (const code of codesFamilles) {
        if (familleIdByCode.has(code)) continue;
        const [inserted] = await tx
          .insert(familles)
          .values({
            entrepriseId: ctx.entreprise.id,
            code,
            libelle: code,
            parentId: null,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: familles.id });
        if (inserted) {
          familleIdByCode.set(code, inserted.id);
          nbFamillesCreees++;
        }
      }

      // Famille de repli "DIVERS" si des lignes n'en ont pas
      let familleDiversId: string | null = null;
      if (lignesValides.some((l) => !l.famille || l.famille.trim() === '')) {
        const [divers] = await tx
          .select({ id: familles.id })
          .from(familles)
          .where(and(eq(familles.code, 'DIVERS'), isNull(familles.deletedAt)))
          .limit(1);
        if (divers) familleDiversId = divers.id;
        else {
          const [inserted] = await tx
            .insert(familles)
            .values({
              entrepriseId: ctx.entreprise.id,
              code: 'DIVERS',
              libelle: 'Divers',
              parentId: null,
              createdBy: ctx.utilisateur.id,
              updatedBy: ctx.utilisateur.id,
            })
            .returning({ id: familles.id });
          if (inserted) {
            familleDiversId = inserted.id;
            nbFamillesCreees++;
          }
        }
      }

      // ── 2. Unités ──────────────────────────────────────────
      const symbolesUnites = Array.from(
        new Set(lignesValides.map((l) => l.unite?.trim() ?? '').filter((u) => u !== '')),
      );
      const uniteIdBySymbole = new Map<string, string>();
      if (symbolesUnites.length > 0) {
        const existantes = await tx
          .select({ id: unites.id, symbole: unites.symbole })
          .from(unites)
          .where(and(inArray(unites.symbole, symbolesUnites), isNull(unites.deletedAt)));
        for (const u of existantes) uniteIdBySymbole.set(u.symbole, u.id);
      }
      let nbUnitesCreees = 0;
      for (const sym of symbolesUnites) {
        if (uniteIdBySymbole.has(sym)) continue;
        const code =
          sym
            .toUpperCase()
            .replace(/[^A-Z0-9._-]/g, '_')
            .slice(0, 16) || 'UNK';
        const [inserted] = await tx
          .insert(unites)
          .values({
            code,
            libelle: sym,
            symbole: sym,
            type: 'autre',
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: unites.id });
        if (inserted) {
          uniteIdBySymbole.set(sym, inserted.id);
          nbUnitesCreees++;
        }
      }

      // ── 3. Articles : récupère existants + crée manquants ──
      const articleIdByCode = new Map<string, string>();
      const codesArticles = lignesValides.map((l) => l.code);
      if (codesArticles.length > 0) {
        const existants = await tx
          .select({ id: articles.id, code: articles.code })
          .from(articles)
          .where(and(inArray(articles.code, codesArticles), isNull(articles.deletedAt)));
        for (const a of existants) articleIdByCode.set(a.code, a.id);
      }

      let nbArticlesCrees = 0;
      let nbArticlesDejaExistants = 0;
      for (const l of lignesValides) {
        if (articleIdByCode.has(l.code)) {
          nbArticlesDejaExistants++;
          continue;
        }
        const familleId =
          l.famille && l.famille.trim() !== ''
            ? familleIdByCode.get(l.famille.toUpperCase().trim())!
            : familleDiversId!;
        const uniteId =
          l.unite && l.unite.trim() !== '' ? (uniteIdBySymbole.get(l.unite.trim()) ?? null) : null;

        const [inserted] = await tx
          .insert(articles)
          .values({
            entrepriseId: ctx.entreprise.id,
            code: l.code,
            libelle: l.libelle,
            familleId,
            type: 'simple',
            uniteAchatId: uniteId,
            uniteStockId: uniteId,
            uniteVenteId: uniteId,
            description: l.description,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: articles.id });
        if (inserted) {
          articleIdByCode.set(l.code, inserted.id);
          nbArticlesCrees++;
        }
      }

      // ── 4. Grille tarifaire ────────────────────────────────
      const [grille] = await tx
        .insert(grillesTarifaires)
        .values({
          entrepriseId: ctx.entreprise.id,
          fournisseurId,
          libelle: infosGrille.libelle.trim().slice(0, 200),
          validFrom: infosGrille.validFrom,
          validTo: infosGrille.validTo,
          actif: true,
          notes: `Importé depuis « ${nomFichier} » le ${new Date().toISOString().slice(0, 10)}`,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: grillesTarifaires.id });
      if (!grille) throw new Error('INSERT grille failed');

      // ── 5. Lignes de grille (uniquement avec prix + unité valides) ──
      const inserts: Array<typeof grilleTarifaireLignes.$inferInsert> = [];
      const articlesDejaDansGrille = new Set<string>();
      for (const l of lignesValides) {
        if (l.prix === null) continue;
        if (!l.unite || l.unite.trim() === '') continue;
        const articleId = articleIdByCode.get(l.code);
        if (!articleId) continue;
        if (articlesDejaDansGrille.has(articleId)) continue;
        articlesDejaDansGrille.add(articleId);
        const uniteId = uniteIdBySymbole.get(l.unite.trim());
        if (!uniteId) continue;
        inserts.push({
          entrepriseId: ctx.entreprise.id,
          grilleId: grille.id,
          articleId,
          prixUnitaireHt: Number(l.prix).toFixed(2),
          uniteId,
          referenceFournisseur: l.referenceFournisseur,
        });
      }
      if (inserts.length > 0) {
        await tx.insert(grilleTarifaireLignes).values(inserts);
      }

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'grilles_tarifaires',
        rowId: grille.id,
        after: {
          libelle: infosGrille.libelle,
          fournisseurId,
          source: 'import-catalogue',
          fichier: nomFichier,
          nbLignes: inserts.length,
          nbArticlesCrees,
        },
      });

      return {
        grilleId: grille.id,
        nbArticlesCrees,
        nbArticlesDejaExistants,
        nbLignesGrille: inserts.length,
        nbFamillesCreees,
        nbUnitesCreees,
      };
    });

    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/familles`);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof Error && err.message === 'FOURNISSEUR_NOT_FOUND') {
      return { ok: false, error: 'Fournisseur introuvable.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return {
        ok: false,
        error:
          "Conflit de données pendant l'insertion (article ou code dupliqué). Reprenez l'import.",
      };
    }
    throw err;
  }
}
