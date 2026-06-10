import { z } from 'zod';

/**
 * Schemas Zod pour la console super-admin (`/admin/entreprises`).
 *
 * Distincts de `lib/validation/entreprise.ts` qui gère les actions
 * intra-tenant (logos, conditions, identité de l'entreprise courante).
 */

const slugRegex = /^[a-z0-9-]{2,40}$/;

const slugEntreprise = z
  .string()
  .trim()
  .min(2, 'Slug trop court (min 2 caractères).')
  .max(40, 'Slug trop long (max 40 caractères).')
  .regex(
    slugRegex,
    'Slug invalide : minuscules, chiffres et tirets uniquement. Sert d\'identifiant dans l\'URL.',
  );

const raisonSociale = z
  .string()
  .trim()
  .min(2, 'Raison sociale trop courte (min 2 caractères).')
  .max(200, 'Raison sociale trop longue (max 200 caractères).');

const siret = z
  .string()
  .trim()
  .regex(/^[0-9]{14}$/, 'SIRET invalide : 14 chiffres exactement.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const tvaIntracom = z
  .string()
  .trim()
  .regex(
    /^[A-Z]{2}[A-Z0-9]{2,13}$/,
    'TVA intracommunautaire invalide (ex : FR12345678901).',
  )
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v.toUpperCase() : null));

const codePostal = z
  .string()
  .trim()
  .regex(/^[0-9]{5}$/, 'Code postal invalide : 5 chiffres.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const optTrimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} trop long (max ${max}).`)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

// Coordonnées légales & bancaires (facturation électronique — migration 0061).
const iban = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .refine(
    (v) => v === '' || /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(v),
    'IBAN invalide.',
  )
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));
const bic = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .refine((v) => v === '' || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(v), 'BIC invalide.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));
const capitalSocial = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/\s/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Capital social invalide.' });
      return z.NEVER;
    }
    return n.toFixed(2);
  });
const codeApe = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .refine((v) => v === '' || /^[0-9]{4}[A-Z]$/.test(v), 'Code APE invalide.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const emailAdmin = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email administrateur invalide.');

/**
 * Création d'une entreprise par un super-admin.
 *
 * Inclut l'email de l'administrateur initial de cette entreprise. Ce dernier
 * recevra un magic-link (s'il n'existe pas déjà) et sera lié à la nouvelle
 * entreprise avec le rôle `admin`.
 */
export const entrepriseCreateSchema = z.object({
  slug: slugEntreprise,
  raisonSociale,
  siret,
  tvaIntracom,
  adresseLigne1: optTrimmed(200, 'Adresse ligne 1'),
  adresseLigne2: optTrimmed(200, 'Adresse ligne 2'),
  codePostal,
  ville: optTrimmed(100, 'Ville'),
  pays: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .default('France'),
  /** Email du compte qui sera promu admin de cette entreprise. */
  adminEmail: emailAdmin,
});
export type EntrepriseCreateInput = z.infer<typeof entrepriseCreateSchema>;

/**
 * Mise à jour de l'identité d'une entreprise par le super-admin.
 * Ne touche pas au binding admin (géré séparément).
 */
export const entrepriseUpdateSchema = z.object({
  raisonSociale,
  siret,
  tvaIntracom,
  adresseLigne1: optTrimmed(200, 'Adresse ligne 1'),
  adresseLigne2: optTrimmed(200, 'Adresse ligne 2'),
  codePostal,
  ville: optTrimmed(100, 'Ville'),
  pays: z.string().trim().min(2).max(100),
  iban,
  bic,
  rcs: optTrimmed(100, 'RCS'),
  formeJuridique: optTrimmed(80, 'Forme juridique'),
  capitalSocial,
  codeApe,
  actif: z.boolean(),
});
export type EntrepriseUpdateInput = z.infer<typeof entrepriseUpdateSchema>;
