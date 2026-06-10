import { z } from 'zod';

import {
  refineRemiseGlobale,
  remiseGlobaleTypeField,
  remiseGlobaleValeurField,
} from '@/lib/remise-globale';

/**
 * Schemas Zod pour le module Facturation (M6).
 *
 * Couvre :
 * - factureSchema (en-tête + lignes, mode direct OU sur situation)
 * - ligneFactureSchema (3 types : section / article_catalogue / libre — mirror devis)
 * - situationTravauxSchema (% cumulé + montants calculés)
 */

const trimmedOptionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

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

const numericPrix = (label: string, allowZero = true) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: `${label} invalide.` });
      return z.NEVER;
    }
    if (allowZero ? n < 0 : n <= 0) {
      ctx.addIssue({ code: 'custom', message: `${label} négatif interdit.` });
      return z.NEVER;
    }
    return n.toFixed(2);
  });

const numericPourcent = (label: string, max = 100) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return '0';
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} invalide.` });
        return z.NEVER;
      }
      if (n < 0 || n > max) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être entre 0 et ${max}.` });
        return z.NEVER;
      }
      return n.toFixed(2);
    });

const optionalUuid = z
  .uuid('Identifiant invalide.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

// ─────────────────────────────────────────────────────────────
// Lignes de facture (mirror lignes devis)
// ─────────────────────────────────────────────────────────────

export const TAUX_TVA_FR = ['0.00', '2.10', '5.50', '10.00', '20.00'] as const;
export const TAUX_TVA_FR_NUM = [0, 2.1, 5.5, 10, 20];

const sectionLigneSchema = z.object({
  type: z.literal('section'),
  designation: z.string().trim().min(1, 'Désignation requise.').max(200),
  articleId: z.null().optional().default(null),
  quantite: z.null().optional().default(null),
  unite: z.null().optional().default(null),
  prixUnitaireHt: z.null().optional().default(null),
  tauxTva: z.null().optional().default(null),
  remisePourcent: z.null().optional().default(null),
  notes: trimmedOptionalString(500),
});

const ligneAvecMontant = {
  designation: z.string().trim().min(1, 'Désignation requise.').max(500),
  quantite: numericStrictlyPositive('Quantité'),
  unite: z.string().trim().min(1, 'Unité requise.').max(20),
  prixUnitaireHt: numericPrix('Prix unitaire HT'),
  tauxTva: z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (Number.isNaN(n) || n < 0 || n > 100) {
        ctx.addIssue({ code: 'custom', message: 'Taux TVA invalide.' });
        return z.NEVER;
      }
      return n.toFixed(2);
    }),
  remisePourcent: numericPourcent('Remise'),
  notes: trimmedOptionalString(500),
};

const articleCatalogueLigneSchema = z.object({
  type: z.literal('article_catalogue'),
  articleId: z.uuid('Article catalogue invalide.'),
  ...ligneAvecMontant,
});

const libreLigneSchema = z.object({
  type: z.literal('libre'),
  articleId: z.null().optional().default(null),
  ...ligneAvecMontant,
});

export const ligneFactureSchema = z.discriminatedUnion('type', [
  sectionLigneSchema,
  articleCatalogueLigneSchema,
  libreLigneSchema,
]);

export type LigneFactureInput = z.infer<typeof ligneFactureSchema>;

// ─────────────────────────────────────────────────────────────
// Facture (en-tête)
// ─────────────────────────────────────────────────────────────

export const factureSchema = z
  .object({
  clientId: z.uuid('Client invalide.'),
  chantierId: optionalUuid,
  devisId: optionalUuid,
  dateFacture: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).'),
  dateEcheance: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’échéance invalide.')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  delaiPaiementJours: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > 365) {
        ctx.addIssue({ code: 'custom', message: 'Délai paiement invalide (0-365 j).' });
        return z.NEVER;
      }
      return n;
    }),
  objet: trimmedOptionalString(200),
  conditionsPaiement: trimmedOptionalString(2000),
  mentionsLegales: trimmedOptionalString(5000),
  notes: trimmedOptionalString(2000),
  autoLiquidation: z.boolean().default(false),
  retenueGarantiePct: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (Number.isNaN(n) || n < 0 || n > 10) {
        ctx.addIssue({
          code: 'custom',
          message: 'Retenue garantie : 0 à 10 % maximum (usage CCAG).',
        });
        return z.NEVER;
      }
      return n.toFixed(2);
    }),
  lignes: z.array(ligneFactureSchema).min(1, 'Au moins une ligne requise.'),
  /** Remise globale sur le total HT (en plus des remises par ligne).
   *  Voir [[lib/remise-globale.ts]]. */
  remiseGlobaleType: remiseGlobaleTypeField,
  remiseGlobaleValeur: remiseGlobaleValeurField,
  })
  .superRefine(refineRemiseGlobale);

export type FactureInput = z.infer<typeof factureSchema>;

// ─────────────────────────────────────────────────────────────
// Situation de travaux
// ─────────────────────────────────────────────────────────────

// Ligne de situation : structure hybride.
// L'utilisateur peut saisir :
//   - quantite + unite + prixUnitaireHt → montant_marche calculé en app
//   - OU directement un montant_marche_ht (forfait)
// Au moins l'un des deux modes doit produire un montant marché > 0.
export const ligneSituationSchema = z
  .object({
    designation: z.string().trim().min(1, 'Désignation requise.').max(500),
    articleId: optionalUuid,
    quantite: z
      .union([z.string(), z.number()])
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isNaN(n) || n <= 0) {
          ctx.addIssue({ code: 'custom', message: 'Quantité invalide.' });
          return z.NEVER;
        }
        return n.toFixed(4);
      }),
    unite: trimmedOptionalString(20),
    prixUnitaireHt: z
      .union([z.string(), z.number()])
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isNaN(n) || n < 0) {
          ctx.addIssue({ code: 'custom', message: 'Prix unitaire invalide.' });
          return z.NEVER;
        }
        return n.toFixed(2);
      }),
    /** Si fourni, prime sur le calcul qty × PU. */
    montantMarcheHt: z
      .union([z.string(), z.number()])
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === '') return null;
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isNaN(n) || n <= 0) {
          ctx.addIssue({ code: 'custom', message: 'Montant marché invalide.' });
          return z.NEVER;
        }
        return n.toFixed(2);
      }),
    pctAvancementCumule: z.union([z.string(), z.number()]).transform((v, ctx) => {
      const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
      if (Number.isNaN(n) || n < 0 || n > 100) {
        ctx.addIssue({
          code: 'custom',
          message: 'Pourcentage entre 0 et 100.',
        });
        return z.NEVER;
      }
      return n.toFixed(2);
    }),
    notes: trimmedOptionalString(500),
    /** Lien optionnel à la ligne équivalente de la situation précédente. */
    lignePrecedenteId: optionalUuid,
  })
  .refine(
    (l) => {
      const aMontantDirect = l.montantMarcheHt !== null;
      const aQtyEtPu = l.quantite !== null && l.prixUnitaireHt !== null;
      return aMontantDirect || aQtyEtPu;
    },
    {
      message: 'Renseignez soit un montant marché HT, soit une quantité + un prix unitaire.',
      path: ['montantMarcheHt'],
    },
  );

export type LigneSituationInput = z.infer<typeof ligneSituationSchema>;

export const situationTravauxSchema = z
  .object({
    chantierId: z.uuid('Chantier invalide.'),
    devisId: optionalUuid,
    dateSituation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'),
    tauxTva: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === '') return '20.00';
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isNaN(n) || n < 0 || n > 100) {
          ctx.addIssue({ code: 'custom', message: 'Taux TVA invalide.' });
          return z.NEVER;
        }
        return n.toFixed(2);
      }),
    notes: trimmedOptionalString(2000),
    lignes: z.array(ligneSituationSchema).min(1, 'Au moins une ligne requise.'),
    /** Remise globale sur le « à facturer HT ». Voir [[lib/remise-globale.ts]]. */
    remiseGlobaleType: remiseGlobaleTypeField,
    remiseGlobaleValeur: remiseGlobaleValeurField,
  })
  .superRefine(refineRemiseGlobale);

export type SituationTravauxInput = z.infer<typeof situationTravauxSchema>;

// ─────────────────────────────────────────────────────────────
// Statuts (libellés UI)
// ─────────────────────────────────────────────────────────────

export const STATUTS_FACTURE = [
  'brouillon',
  'emise',
  'payee',
  'en_retard',
  'annulee',
] as const;
export type StatutFacture = (typeof STATUTS_FACTURE)[number];

export const LIBELLES_STATUT_FACTURE: Record<StatutFacture, string> = {
  brouillon: 'Brouillon',
  emise: 'Émise',
  payee: 'Payée',
  en_retard: 'En retard',
  annulee: 'Annulée',
};

export const STATUTS_SITUATION = ['brouillon', 'validee', 'facturee', 'annulee'] as const;
export type StatutSituation = (typeof STATUTS_SITUATION)[number];

export const LIBELLES_STATUT_SITUATION: Record<StatutSituation, string> = {
  brouillon: 'Brouillon',
  validee: 'Validée',
  facturee: 'Facturée',
  annulee: 'Annulée',
};

/**
 * Transitions autorisées d'une facture. brouillon → emise (action « émettre »),
 * emise → payee (action « marquer payée »), emise → en_retard (job cron à venir
 * en M9), tout statut sauf payee/annulee → annulee.
 */
export const TRANSITIONS_FACTURE: Record<StatutFacture, StatutFacture[]> = {
  brouillon: ['emise', 'annulee'],
  emise: ['payee', 'en_retard', 'annulee'],
  en_retard: ['payee', 'annulee'],
  payee: [],
  annulee: [],
};
