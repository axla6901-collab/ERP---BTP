import { z } from 'zod';

/**
 * Schémas Zod — Contrats de sous-traitance (M8.2).
 * Miroir DB : db/schema/sous-traitance.ts (contratsSt), migration 0064.
 */

const trimmedOptionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const dateOptionnelle = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

/** Montant HT ≥ 0, normalisé en chaîne toFixed(2). */
const montantHt = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (Number.isNaN(n) || n < 0) {
    ctx.addIssue({ code: 'custom', message: 'Montant HT invalide (≥ 0).' });
    return z.NEVER;
  }
  return n.toFixed(2);
});

/** Taux de retenue 0–10 %, défaut 0 (copié du sous-traitant à la création). */
const tauxRetenueGarantie = z.preprocess(
  (v) => (v === undefined || v === null || v === '' ? 0 : v),
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n) || n < 0 || n > 10) {
      ctx.addIssue({ code: 'custom', message: 'Retenue de garantie : 0 à 10 % maximum.' });
      return z.NEVER;
    }
    return n.toFixed(2);
  }),
);

export const STATUT_CONTRAT_ST_VALUES = [
  'brouillon',
  'actif',
  'suspendu',
  'solde',
  'annule',
] as const;
export type StatutContratSt = (typeof STATUT_CONTRAT_ST_VALUES)[number];

export const LIBELLES_STATUT_CONTRAT_ST: Record<StatutContratSt, string> = {
  brouillon: 'Brouillon',
  actif: 'Actif',
  suspendu: 'Suspendu',
  solde: 'Soldé',
  annule: 'Annulé',
};

/**
 * Transitions autorisées. L'activation (brouillon/suspendu → actif) est soumise
 * au contrôle de conformité documentaire du sous-traitant (cf.
 * `lib/sous-traitance/conformite-st.ts`).
 */
export const TRANSITIONS_CONTRAT_ST: Record<StatutContratSt, StatutContratSt[]> = {
  brouillon: ['actif', 'annule'],
  actif: ['suspendu', 'solde', 'annule'],
  suspendu: ['actif', 'annule'],
  solde: [],
  annule: [],
};

export const contratStSchema = z
  .object({
    sousTraitantId: z.uuid('Sous-traitant invalide.'),
    chantierId: z.uuid('Chantier invalide.'),
    objet: trimmedOptionalString(300),
    montantHt,
    tauxRetenueGarantie,
    dateSignature: dateOptionnelle,
    dateDebutPrevue: dateOptionnelle,
    dateFinPrevue: dateOptionnelle,
    statut: z.enum(STATUT_CONTRAT_ST_VALUES).default('brouillon'),
    notes: trimmedOptionalString(2000),
  })
  .refine((c) => !c.dateDebutPrevue || !c.dateFinPrevue || c.dateFinPrevue >= c.dateDebutPrevue, {
    message: 'La date de fin prévue doit suivre la date de début.',
    path: ['dateFinPrevue'],
  });

export type ContratStInput = z.infer<typeof contratStSchema>;
