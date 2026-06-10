import { z } from 'zod';

/**
 * Schemas Zod pour le catalogue (M2.1-bis).
 *
 * Le modèle est aligné sur l'ADR-008 (Articles Composés) :
 *   - Familles hiérarchiques (parent_id optionnel)
 *   - Articles unifiés (type : simple / composé / prestation / opération)
 *   - Triple unité (achat / stock / vente) + caractéristiques physiques
 *   - Référentiel d'unités (référentiel partagé)
 */

const codeMetier = z
  .string()
  .trim()
  .min(2, 'Code trop court (min 2 caractères).')
  .max(32, 'Code trop long (max 32 caractères).')
  .regex(/^[A-Z0-9._-]+$/i, 'Code invalide : lettres, chiffres, points, tirets et underscores.')
  .transform((v) => v.toUpperCase());

const libelleMetier = z
  .string()
  .trim()
  .min(2, 'Libellé trop court (min 2 caractères).')
  .max(200, 'Libellé trop long (max 200 caractères).');

const description = z
  .string()
  .trim()
  .max(2000, 'Description trop longue (max 2000 caractères).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const numericPositive = (label: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} invalide.` });
        return z.NEVER;
      }
      if (n <= 0) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être > 0.` });
        return z.NEVER;
      }
      return n.toFixed(4);
    });

const optionalUuid = z
  .uuid('Identifiant invalide.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

// ─────────────────────────────────────────────────────────────
// Unités
// ─────────────────────────────────────────────────────────────

export const UNITE_TYPES = [
  'masse',
  'longueur',
  'surface',
  'volume',
  'unitaire',
  'temps',
  'autre',
] as const;
export type UniteType = (typeof UNITE_TYPES)[number];

export const uniteSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Code requis.')
    .max(16, 'Code trop long (max 16).')
    .regex(/^[A-Z0-9._-]+$/i, 'Code invalide.')
    .transform((v) => v.toUpperCase()),
  libelle: libelleMetier,
  symbole: z.string().trim().min(1, 'Symbole requis.').max(10, 'Symbole trop long.'),
  type: z.enum(UNITE_TYPES),
  actif: z.boolean().default(true),
});

export type UniteInput = z.infer<typeof uniteSchema>;

// ─────────────────────────────────────────────────────────────
// Familles (hiérarchiques)
// ─────────────────────────────────────────────────────────────

export const familleSchema = z.object({
  code: codeMetier,
  libelle: libelleMetier,
  parentId: optionalUuid,
  description,
  ordre: z.number().int().nonnegative().default(0),
  actif: z.boolean().default(true),
});

export type FamilleInput = z.infer<typeof familleSchema>;

// ─────────────────────────────────────────────────────────────
// Articles (unifiés)
// ─────────────────────────────────────────────────────────────

export const ARTICLE_TYPES = ['simple', 'compose', 'prestation', 'operation'] as const;
export type ArticleType = (typeof ARTICLE_TYPES)[number];

export const LIBELLES_ARTICLE_TYPE: Record<ArticleType, string> = {
  simple: 'Article simple',
  compose: 'Article composé',
  prestation: 'Prestation',
  operation: 'Opération de production',
};

export const articleSchema = z.object({
  code: codeMetier,
  libelle: libelleMetier,
  familleId: z.uuid('ID de famille invalide.'),
  type: z.enum(ARTICLE_TYPES).default('simple'),
  uniteAchatId: optionalUuid,
  uniteStockId: optionalUuid,
  uniteVenteId: optionalUuid,
  fournisseurPrefereId: optionalUuid,
  densite: numericPositive('Densité'),
  epaisseur: numericPositive('Épaisseur'),
  longueurStd: numericPositive('Longueur standard'),
  largeurStd: numericPositive('Largeur standard'),
  description,
  actif: z.boolean().default(true),
});

export type ArticleInput = z.infer<typeof articleSchema>;

// Le schéma `fournisseurSchema` a été déplacé dans `@/lib/validation/tiers`
// (module Tiers : fournisseurs + sous-traitants).

// ─────────────────────────────────────────────────────────────
// Nomenclatures versionnées
// ─────────────────────────────────────────────────────────────

const numericStrictlyPositive = (label: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: `${label} invalide.` });
      return z.NEVER;
    }
    if (n <= 0) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être > 0.` });
      return z.NEVER;
    }
    return n.toFixed(4);
  });

const numericPourcentage = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return '0';
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: 'Pourcentage invalide.' });
      return z.NEVER;
    }
    // Accepter saisie en % (5 = 5%) ou en décimal (0.05 = 5%)
    const normalized = n >= 1 ? n / 100 : n;
    if (normalized < 0 || normalized >= 1) {
      ctx.addIssue({ code: 'custom', message: 'Doit être entre 0 % et 100 %.' });
      return z.NEVER;
    }
    return normalized.toFixed(4);
  });

export const nomenclatureLigneSchema = z.object({
  composantArticleId: z.uuid('Composant invalide.'),
  quantite: numericStrictlyPositive('Quantité'),
  uniteEmploiId: z.uuid('Unité invalide.'),
  coefficientPerte: numericPourcentage,
  notes: z
    .string()
    .trim()
    .max(500, 'Notes trop longues.')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type NomenclatureLigneInput = z.infer<typeof nomenclatureLigneSchema>;

export const nomenclatureSchema = z.object({
  libelle: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  lignes: z.array(nomenclatureLigneSchema).min(1, 'Au moins une ligne requise.'),
});

export type NomenclatureInput = z.infer<typeof nomenclatureSchema>;

// ─────────────────────────────────────────────────────────────
// Prix articles (multi-fournisseurs)
// ─────────────────────────────────────────────────────────────

const numericNonNegatif = (label: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: `${label} invalide.` });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({ code: 'custom', message: `${label} négatif interdit.` });
      return z.NEVER;
    }
    return n.toFixed(2);
  });

export const prixArticleSchema = z
  .object({
    prixUnitaireHt: numericNonNegatif('Prix unitaire HT'),
    uniteId: z.uuid('Unité invalide.'),
    fournisseurId: optionalUuid,
    referenceFournisseur: z
      .string()
      .trim()
      .max(100)
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    quantiteMin: z
      .union([z.string(), z.number()])
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isNaN(n)) {
          ctx.addIssue({ code: 'custom', message: 'Quantité min invalide.' });
          return z.NEVER;
        }
        if (n <= 0) {
          ctx.addIssue({ code: 'custom', message: 'Quantité min doit être > 0.' });
          return z.NEVER;
        }
        return n.toFixed(4);
      }),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date début invalide (YYYY-MM-DD).'),
    validTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date fin invalide (YYYY-MM-DD).')
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    notes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .refine((d) => !d.validTo || d.validTo >= d.validFrom, {
    message: 'Date de fin antérieure à la date de début.',
    path: ['validTo'],
  });

export type PrixArticleInput = z.infer<typeof prixArticleSchema>;

// ─────────────────────────────────────────────────────────────
// Grilles tarifaires fournisseur (M2.4)
// ─────────────────────────────────────────────────────────────

const quantiteMinOptionnelle = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: 'Quantité min invalide.' });
      return z.NEVER;
    }
    if (n <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Quantité min doit être > 0.' });
      return z.NEVER;
    }
    return n.toFixed(4);
  });

const texteCourtOptionnel = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

export const grilleTarifaireLigneSchema = z.object({
  articleId: z.uuid('Article invalide.'),
  prixUnitaireHt: numericNonNegatif('Prix unitaire HT'),
  uniteId: z.uuid('Unité invalide.'),
  referenceFournisseur: texteCourtOptionnel(100),
  quantiteMin: quantiteMinOptionnelle,
  notes: texteCourtOptionnel(500),
});

export type GrilleTarifaireLigneInput = z.infer<typeof grilleTarifaireLigneSchema>;

export const grilleTarifaireSchema = z
  .object({
    libelle: libelleMetier,
    chantierId: optionalUuid,
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date début invalide (YYYY-MM-DD).'),
    validTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date fin invalide (YYYY-MM-DD).')
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    actif: z.boolean().default(true),
    notes: texteCourtOptionnel(2000),
    lignes: z
      .array(grilleTarifaireLigneSchema)
      .min(1, 'Au moins une ligne requise.')
      .superRefine((lignes, ctx) => {
        const vus = new Set<string>();
        lignes.forEach((l, i) => {
          if (vus.has(l.articleId)) {
            ctx.addIssue({
              code: 'custom',
              path: [i, 'articleId'],
              message: 'Article déjà présent dans la grille.',
            });
          }
          vus.add(l.articleId);
        });
      }),
  })
  .refine((d) => !d.validTo || d.validTo >= d.validFrom, {
    message: 'Date de fin antérieure à la date de début.',
    path: ['validTo'],
  });

export type GrilleTarifaireInput = z.infer<typeof grilleTarifaireSchema>;
