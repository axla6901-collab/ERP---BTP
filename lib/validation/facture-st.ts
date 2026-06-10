import { z } from 'zod';

import {
  refineRemiseGlobale,
  remiseGlobaleTypeField,
  remiseGlobaleValeurField,
} from '@/lib/remise-globale';

import { ligneFactureSchema } from './facturation';

/**
 * Schémas Zod — Factures de sous-traitant (M8.3).
 * Miroir DB : db/schema/sous-traitance.ts (facturesSt / lignesFactureSt), migration 0065.
 *
 * Fork de `factureSchema` (mêmes lignes / remise globale) avec deux écarts BTP :
 *   - `retenueGarantiePct` OBLIGATOIRE (figée depuis le contrat ST), défaut 0.
 *   - `paiementDirect` (loi 75-1334 §III) + `autoLiquidation` par défaut TRUE
 *     (le sous-traitant facture HT, le donneur d'ordre auto-liquide la TVA —
 *     art. 283-2 nonies CGI).
 */

const trimmedOptionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

/** Retenue 0–10 %, OBLIGATOIRE (défaut 0). Chaîne toFixed(2). */
const retenueGarantiePct = z.preprocess(
  (v) => (v === undefined || v === null || v === '' ? 0 : v),
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n) || n < 0 || n > 10) {
      ctx.addIssue({ code: 'custom', message: 'Retenue de garantie : 0 à 10 % maximum (usage CCAG).' });
      return z.NEVER;
    }
    return n.toFixed(2);
  }),
);

export const factureStSchema = z
  .object({
    contratStId: z.uuid('Contrat de sous-traitance invalide.'),
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
    notes: trimmedOptionalString(2000),
    autoLiquidation: z.boolean().default(true),
    paiementDirect: z.boolean().default(false),
    retenueGarantiePct,
    lignes: z.array(ligneFactureSchema).min(1, 'Au moins une ligne requise.'),
    remiseGlobaleType: remiseGlobaleTypeField,
    remiseGlobaleValeur: remiseGlobaleValeurField,
  })
  .superRefine(refineRemiseGlobale);

export type FactureStInput = z.infer<typeof factureStSchema>;

// Statuts : identiques aux factures clientes (réutilise l'enum statut_facture_st
// défini en miroir). Transitions identiques à TRANSITIONS_FACTURE.
export const STATUTS_FACTURE_ST = [
  'brouillon',
  'emise',
  'payee',
  'en_retard',
  'annulee',
] as const;
export type StatutFactureSt = (typeof STATUTS_FACTURE_ST)[number];

export const LIBELLES_STATUT_FACTURE_ST: Record<StatutFactureSt, string> = {
  brouillon: 'Brouillon',
  emise: 'Émise',
  payee: 'Payée',
  en_retard: 'En retard',
  annulee: 'Annulée',
};

export const TRANSITIONS_FACTURE_ST: Record<StatutFactureSt, StatutFactureSt[]> = {
  brouillon: ['emise', 'annulee'],
  emise: ['payee', 'en_retard', 'annulee'],
  en_retard: ['payee', 'annulee'],
  payee: [],
  annulee: [],
};

/** Enregistrement d'un paiement (partiel ou total) d'une facture ST. */
export const paiementStSchema = z.object({
  montant: z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n) || n <= 0) {
      ctx.addIssue({ code: 'custom', message: 'Montant de paiement invalide (> 0).' });
      return z.NEVER;
    }
    return n.toFixed(2);
  }),
  datePaiement: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type PaiementStInput = z.infer<typeof paiementStSchema>;
