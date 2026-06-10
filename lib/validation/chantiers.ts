import { z } from 'zod';

/**
 * Schemas Zod pour le module Chantiers (M4.1).
 */

const trimmedOptionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const optionalMontant = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: 'Montant invalide.' });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Montant négatif interdit.' });
      return z.NEVER;
    }
    return n.toFixed(2);
  });

const optionalCodePostalFR = z
  .string()
  .trim()
  .regex(/^\d{5}$/, 'Code postal invalide (5 chiffres).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

export const STATUTS_CHANTIER = [
  'prospect',
  'en_cours',
  'suspendu',
  'termine',
  'annule',
] as const;
export type StatutChantier = (typeof STATUTS_CHANTIER)[number];

export const LIBELLES_STATUT_CHANTIER: Record<StatutChantier, string> = {
  prospect: 'Prospect',
  en_cours: 'En cours',
  suspendu: 'Suspendu',
  termine: 'Terminé',
  annule: 'Annulé',
};

export const TRANSITIONS_CHANTIER: Record<StatutChantier, StatutChantier[]> = {
  prospect: ['en_cours', 'annule'],
  en_cours: ['suspendu', 'termine', 'annule'],
  suspendu: ['en_cours', 'annule'],
  termine: [],
  annule: [],
};

export const chantierSchema = z
  .object({
    libelle: z.string().trim().min(2, 'Libellé requis (2 caractères min).').max(200),
    clientId: z.uuid('Client invalide.'),
    responsableId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    statut: z.enum(STATUTS_CHANTIER).default('prospect'),
    dateDebutPrevue: optionalDate,
    dateFinPrevue: optionalDate,
    dateDebutReelle: optionalDate,
    dateFinReelle: optionalDate,
    montantPrevisionnelHt: optionalMontant,
    adresseLigne1: trimmedOptionalString(200),
    adresseLigne2: trimmedOptionalString(200),
    codePostal: optionalCodePostalFR,
    ville: trimmedOptionalString(100),
    description: trimmedOptionalString(2000),
    notes: trimmedOptionalString(2000),
  })
  .superRefine((val, ctx) => {
    if (val.dateDebutPrevue && val.dateFinPrevue && val.dateFinPrevue < val.dateDebutPrevue) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFinPrevue'],
        message: 'Date de fin prévue antérieure à la date de début.',
      });
    }
    if (val.dateDebutReelle && val.dateFinReelle && val.dateFinReelle < val.dateDebutReelle) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFinReelle'],
        message: 'Date de fin réelle antérieure à la date de début.',
      });
    }
  });

export type ChantierInput = z.infer<typeof chantierSchema>;
