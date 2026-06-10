import { z } from 'zod';

/**
 * Schemas Zod — paramétrage de la société (identité, logos, CGV/CGA).
 * Utilisés par les server actions `lib/admin/entreprise*.ts`.
 */

// ─────────────────────────────────────────────────────────────
// Identité de l'entreprise
// ─────────────────────────────────────────────────────────────

const textRequis = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} requis.`)
    .max(max, `${label} trop long (max ${max} caractères).`);

const textOptionnel = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Champ trop long (max ${max} caractères).`)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

export const entrepriseIdentiteSchema = z.object({
  raisonSociale: textRequis('Raison sociale', 200),
  siret: z
    .string()
    .trim()
    .regex(/^[0-9]{14}$/, 'SIRET invalide (14 chiffres exacts).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  tvaIntracom: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}[A-Z0-9]{2,13}$/, 'N° TVA intracom invalide (ex : FR12345678901).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  adresseLigne1: textOptionnel(200),
  adresseLigne2: textOptionnel(200),
  codePostal: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, 'Code postal invalide (5 chiffres).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  ville: textOptionnel(100),
  pays: textRequis('Pays', 80),
  // Coordonnées légales & bancaires (facturation électronique — migration 0061).
  iban: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine(
      (v) => v === '' || /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(v),
      'IBAN invalide (ex : FR7630006000011234567890189).',
    )
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  bic: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine(
      (v) => v === '' || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(v),
      'BIC invalide (8 ou 11 caractères, ex : BNPAFRPP).',
    )
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  rcs: textOptionnel(100),
  formeJuridique: textOptionnel(80),
  capitalSocial: z
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
    }),
  codeApe: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, '').toUpperCase())
    .refine(
      (v) => v === '' || /^[0-9]{4}[A-Z]$/.test(v),
      'Code APE invalide (4 chiffres + 1 lettre, ex : 4399C).',
    )
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});
export type EntrepriseIdentiteInput = z.infer<typeof entrepriseIdentiteSchema>;

// ─────────────────────────────────────────────────────────────
// Logos
// ─────────────────────────────────────────────────────────────

export const LOGO_MIME_AUTORISES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
] as const;
export type LogoMime = (typeof LOGO_MIME_AUTORISES)[number];

export const LOGO_TAILLE_MAX_OCTETS = 5 * 1024 * 1024; // 5 Mo

export const logoTypeSchema = z.enum(['principal', 'certification']);
export type LogoType = z.infer<typeof logoTypeSchema>;

export const logoUploadMetaSchema = z.object({
  type: logoTypeSchema,
  libelle: z
    .string()
    .trim()
    .min(1, 'Libellé requis (ex : "Logo société", "RGE Qualibat").')
    .max(120, 'Libellé trop long (max 120 caractères).'),
});
export type LogoUploadMetaInput = z.infer<typeof logoUploadMetaSchema>;

export const logoRenommerSchema = z.object({
  libelle: z
    .string()
    .trim()
    .min(1, 'Libellé requis.')
    .max(120, 'Libellé trop long (max 120 caractères).'),
});
export type LogoRenommerInput = z.infer<typeof logoRenommerSchema>;

export const logoReorderSchema = z
  .array(
    z.object({
      id: z.uuid(),
      ordre: z.number().int().min(0).max(1000),
    }),
  )
  .max(100);
export type LogoReorderInput = z.infer<typeof logoReorderSchema>;

// ─────────────────────────────────────────────────────────────
// Conditions générales (CGV / CGA)
// ─────────────────────────────────────────────────────────────

export const conditionTypeSchema = z.enum(['cgv', 'cga']);
export type ConditionType = z.infer<typeof conditionTypeSchema>;

export const CONDITION_HTML_TAILLE_MAX = 200_000;

export const conditionNouvelleVersionSchema = z.object({
  type: conditionTypeSchema,
  contenuHtml: z
    .string()
    .min(1, 'Contenu vide : rédigez vos conditions avant publication.')
    .max(
      CONDITION_HTML_TAILLE_MAX,
      `Contenu trop volumineux (max ${CONDITION_HTML_TAILLE_MAX} caractères HTML).`,
    ),
  contenuJson: z.unknown().optional().nullable(),
  dateEffet: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date d’effet invalide (format YYYY-MM-DD).'),
  commentaire: z
    .string()
    .trim()
    .max(500, 'Commentaire trop long (max 500 caractères).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});
export type ConditionNouvelleVersionInput = z.infer<typeof conditionNouvelleVersionSchema>;
