import { z } from 'zod';

/**
 * Helpers Zod partagés par tous les schémas du module Test SIRH
 * (`lib/validation/test-sirh/<domaine>.ts`). Calqués sur lib/validation/flotte.ts.
 *
 * ⚠️ Convention héritée du module Flotte : les helpers « optionnels »
 * (`.optional().nullable().transform()`) rendent en pratique la CLÉ obligatoire
 * dans le type de sortie — l'UI envoie donc TOUJOURS toutes les clés (valeur
 * `null` si vide). Avec zod v4, `z.string().uuid()` exige un UUID valide
 * (version + variante) : utiliser de vrais UUID dans les tests.
 */

const estVide = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Texte requis, trimé, borné. */
export const texteRequis = (label: string, max: number) =>
  z
    .string({ error: `${label} requis.` })
    .trim()
    .min(1, `${label} requis.`)
    .max(max, `${label} trop long (max ${max} caractères).`);

/** Texte optionnel (vide → null), trimé, borné. */
export const texteOptionnel = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Texte trop long (max ${max} caractères).`)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const REGEX_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Date ISO `YYYY-MM-DD` requise. */
export const dateRequise = z.string().trim().regex(REGEX_DATE, 'Date invalide (AAAA-MM-JJ).');

/** Date ISO optionnelle (vide → null). */
export const dateOptionnelle = z
  .string()
  .trim()
  .regex(REGEX_DATE, 'Date invalide (AAAA-MM-JJ).')
  .optional()
  .nullable()
  .or(z.literal(''))
  .transform((v) => (v && v.length > 0 ? v : null));

/** UUID requis. */
export const uuidRequis = (label = 'Identifiant') => z.string().trim().uuid(`${label} invalide.`);

/** UUID optionnel (vide → null). */
export const uuidOptionnel = z
  .string()
  .trim()
  .uuid('Identifiant invalide.')
  .optional()
  .nullable()
  .or(z.literal(''))
  .transform((v) => (v && v.length > 0 ? v : null));

/** Heure `HH:MM` (ou `HH:MM:SS`) requise, normalisée en `HH:MM`. */
export const heureRequise = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Heure invalide (HH:MM).')
  .transform((v) => v.slice(0, 5));

/** Heure optionnelle (vide → null), normalisée en `HH:MM`. */
export const heureOptionnelle = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Heure invalide (HH:MM).')
  .optional()
  .nullable()
  .or(z.literal(''))
  .transform((v) => (v && v.length > 0 ? v.slice(0, 5) : null));

function versNombreSaisi(v: string | number): number {
  return typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
}

/**
 * Décimal optionnel normalisé en chaîne (`numeric` Drizzle), ou null si vide.
 * Options : bornes `min`/`max`, `decimales` (2 par défaut), `strictementPositif`.
 */
export const decimalOptionnel = (
  label: string,
  opts: { min?: number; max?: number; decimales?: number; strictementPositif?: boolean } = {},
) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (estVide(v)) return null;
      const n = versNombreSaisi(v as string | number);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} invalide.` });
        return null;
      }
      if (opts.strictementPositif && n <= 0) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être strictement positif.` });
        return null;
      }
      if (opts.min !== undefined && n < opts.min) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être ≥ ${opts.min}.` });
        return null;
      }
      if (opts.max !== undefined && n > opts.max) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être ≤ ${opts.max}.` });
        return null;
      }
      return n.toFixed(opts.decimales ?? 2);
    });

/** Décimal requis (mêmes options que `decimalOptionnel`), normalisé en chaîne. */
export const decimalRequis = (
  label: string,
  opts: { min?: number; max?: number; decimales?: number; strictementPositif?: boolean } = {},
) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    if (estVide(v)) {
      ctx.addIssue({ code: 'custom', message: `${label} requis.` });
      return '0';
    }
    const n = versNombreSaisi(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: 'custom', message: `${label} invalide.` });
      return '0';
    }
    if (opts.strictementPositif && n <= 0) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être strictement positif.` });
      return '0';
    }
    if (opts.min !== undefined && n < opts.min) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être ≥ ${opts.min}.` });
      return '0';
    }
    if (opts.max !== undefined && n > opts.max) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être ≤ ${opts.max}.` });
      return '0';
    }
    return n.toFixed(opts.decimales ?? 2);
  });

/** Montant en euros ≥ 0, optionnel (vide → null), normalisé à 2 décimales. */
export const montantOptionnel = (label: string) => decimalOptionnel(label, { min: 0 });

/** Montant en euros ≥ 0 requis, normalisé à 2 décimales. */
export const montantRequis = (label: string) => decimalRequis(label, { min: 0 });

/** Entier optionnel borné (vide → null). */
export const entierOptionnel = (label: string, opts: { min?: number; max?: number } = {}) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (estVide(v)) return null;
      const n = versNombreSaisi(v as string | number);
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être un entier.` });
        return null;
      }
      if (opts.min !== undefined && n < opts.min) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être ≥ ${opts.min}.` });
        return null;
      }
      if (opts.max !== undefined && n > opts.max) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être ≤ ${opts.max}.` });
        return null;
      }
      return n;
    });

/** Entier requis borné. */
export const entierRequis = (label: string, opts: { min?: number; max?: number } = {}) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    if (estVide(v)) {
      ctx.addIssue({ code: 'custom', message: `${label} requis.` });
      return 0;
    }
    const n = versNombreSaisi(v);
    if (!Number.isInteger(n)) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être un entier.` });
      return 0;
    }
    if (opts.min !== undefined && n < opts.min) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être ≥ ${opts.min}.` });
      return 0;
    }
    if (opts.max !== undefined && n > opts.max) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être ≤ ${opts.max}.` });
      return 0;
    }
    return n;
  });

/** Couleur hexadécimale `#RRGGBB` (CHECK SQL identique). */
export const couleurHex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide (#RRGGBB).');

/** Email optionnel (vide → null). */
export const emailOptionnel = z
  .string()
  .trim()
  .max(200, 'Email trop long.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Email invalide.');

/** Code postal français optionnel (5 chiffres, CHECK SQL identique). */
export const codePostalOptionnel = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null))
  .refine((v) => v === null || /^[0-9]{5}$/.test(v), 'Code postal invalide (5 chiffres).');

/** Note de 1 à 5 optionnelle. */
export const noteOptionnelle = entierOptionnel('Note', { min: 1, max: 5 });

/** Schéma minimal d'activation d'une option (flag entreprise). */
export const sirhFlagSchema = z.object({ actif: z.boolean() });
export type SirhFlagInput = z.infer<typeof sirhFlagSchema>;

/** Décision sur une demande (absence, heures sup, note de frais). */
export const decisionSchema = z.object({
  id: uuidRequis('Demande'),
  decision: z.enum(['approuver', 'refuser']),
  commentaire: texteOptionnel(1000),
});
export type DecisionInput = z.infer<typeof decisionSchema>;
