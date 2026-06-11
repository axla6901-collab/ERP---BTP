import { z } from 'zod';

/**
 * Schemas Zod du module Tiers : fournisseurs et sous-traitants.
 *
 * Conforme aux exigences légales BTP :
 *   - sous-traitants : SIRET, TVA intracom, assurance décennale, agrément DC4,
 *     attestation URSSAF/vigilance, qualifications libres (Qualibat, RGE…)
 */

const codeMetier = z
  .string()
  .trim()
  .min(2, 'Code trop court (min 2 caractères).')
  .max(32, 'Code trop long (max 32 caractères).')
  .regex(/^[A-Z0-9._-]+$/i, 'Code invalide : lettres, chiffres, points, tirets et underscores.')
  .transform((v) => v.toUpperCase());

const nomMetier = z
  .string()
  .trim()
  .min(2, 'Nom trop court (min 2 caractères).')
  .max(200, 'Nom trop long (max 200 caractères).');

const siretOptionnel = z
  .string()
  .trim()
  .regex(/^\d{14}$/, 'SIRET invalide (14 chiffres requis).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const emailOptionnel = z
  .email('Email invalide.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const telephoneOptionnel = z
  .string()
  .trim()
  .max(30, 'Téléphone trop long.')
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

// ─────────────────────────────────────────────────────────────
// Adresse (partagée fournisseur + sous-traitant)
// ─────────────────────────────────────────────────────────────

const adresseShape = {
  adresseLigne1: z
    .string()
    .trim()
    .max(200, 'Adresse trop longue.')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  adresseLigne2: z
    .string()
    .trim()
    .max(200, 'Adresse trop longue.')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  codePostal: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, 'Code postal invalide (5 chiffres).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  ville: z
    .string()
    .trim()
    .max(100, 'Ville trop longue.')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  pays: z.string().trim().min(1).max(100).default('France'),
} as const;

// ─────────────────────────────────────────────────────────────
// Contacts (partagé fournisseur + sous-traitant)
// ─────────────────────────────────────────────────────────────

export const contactSchema = z.object({
  // Présent en update (contact existant), absent en création (nouveau contact).
  id: z.string().uuid().optional(),
  nom: z.string().trim().min(1, 'Nom requis.').max(100, 'Nom trop long (max 100 caractères).'),
  prenom: z
    .string()
    .trim()
    .max(100, 'Prénom trop long.')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  fonction: z
    .string()
    .trim()
    .max(100, 'Fonction trop longue.')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  email: emailOptionnel,
  telephoneMobile: telephoneOptionnel,
  telephoneFixe: telephoneOptionnel,
  notes: z
    .string()
    .trim()
    .max(1000, 'Notes trop longues (max 1000 caractères).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  principal: z.boolean().default(false),
  actif: z.boolean().default(true),
});

export type ContactInput = z.infer<typeof contactSchema>;

/** Source de rattachement d'un contact : les trois types de tiers. */
export const SOURCES_CONTACT = ['fournisseur', 'sous_traitant', 'client'] as const;

/**
 * Création d'un contact via la frame `ContactDialog` (annuaire consolidé ou
 * fiche d'un tiers) : reprend tous les champs d'un contact et y ajoute le tiers
 * de rattachement obligatoire (`source` + `tiersId`). Les trois types de tiers
 * — fournisseur, sous-traitant, client — disposent désormais de contacts.
 */
export const creerContactSchema = contactSchema.extend({
  source: z.enum(SOURCES_CONTACT),
  tiersId: z.string().uuid('Choisissez le tiers de rattachement.'),
});

export type CreerContactInput = z.infer<typeof creerContactSchema>;

// Les contacts ne font plus partie du formulaire du tiers : ils sont créés,
// édités et supprimés individuellement via la frame `ContactDialog`
// (enregistrement immédiat en base, server actions `lib/tiers/contacts-actions.ts`).
// `contactSchema` reste la source de vérité partagée par les trois types de tiers.

// ─────────────────────────────────────────────────────────────
// Fournisseurs
// ─────────────────────────────────────────────────────────────

export const fournisseurSchema = z.object({
  code: codeMetier,
  nom: nomMetier,
  siret: siretOptionnel,
  email: emailOptionnel,
  telephone: telephoneOptionnel,
  ...adresseShape,
  actif: z.boolean().default(true),
});

export type FournisseurInput = z.infer<typeof fournisseurSchema>;

// ─────────────────────────────────────────────────────────────
// Sous-traitants
// ─────────────────────────────────────────────────────────────

/**
 * Statut d'agrément du sous-traitant : cycle de vie référencement BTP.
 * Source de vérité partagée par le schéma Drizzle (enum Postgres), le
 * formulaire, la table et le badge. `a_qualifier` est l'état initial.
 */
export const STATUT_SOUS_TRAITANT_VALUES = [
  'a_qualifier',
  'en_cours_agrement',
  'agree',
  'suspendu',
  'refuse',
] as const;

export type StatutSousTraitant = (typeof STATUT_SOUS_TRAITANT_VALUES)[number];

export const STATUT_SOUS_TRAITANT_LABELS: Record<StatutSousTraitant, string> = {
  a_qualifier: 'À qualifier',
  en_cours_agrement: "En cours d'agrément",
  agree: 'Agréé',
  suspendu: 'Suspendu',
  refuse: 'Refusé',
};

const nTvaIntra = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}[A-Z0-9]{2,13}$/i, 'N° TVA intracom invalide (ex. FR12345678901).')
  .transform((v) => v.toUpperCase())
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const qualifications = z
  .array(
    z
      .string()
      .trim()
      .min(1, 'Qualification vide.')
      .max(100, 'Qualification trop longue (max 100 caractères).'),
  )
  .max(20, 'Trop de qualifications (max 20).')
  .default([])
  .transform((arr) => arr.filter((q) => q.length > 0));

/**
 * Sous-traitant « parent » (donneur d'ordre interne) de la cascade — optionnel.
 * Chaîne vide → null. La cohérence cascade (profondeur ≤ 3, pas de cycle, même
 * entreprise) est garantie par le trigger SQL `trg_st_anti_cycle` (0061) ; ici
 * on valide seulement le format UUID.
 */
const parentStIdOptionnel = z.preprocess(
  (v) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v),
  z.string().uuid('Sous-traitant parent invalide.').nullable(),
);

/**
 * Taux de retenue de garantie par défaut du sous-traitant (0–10 %, usage CCAG).
 * Même normalisation que `facturation.retenueGarantiePct` mais NON nullable
 * (défaut 0). Retourne une chaîne `toFixed(2)` (colonne `numeric`).
 *
 * `preprocess` (et non `.optional()`) pour que l'absence de clé soit bien
 * coercée à 0 : avec `.optional()`, Zod court-circuite le `.transform`.
 */
const tauxRetenueGarantie = z.preprocess(
  (v) => (v === undefined || v === null || v === '' ? 0 : v),
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n) || n < 0 || n > 10) {
      ctx.addIssue({
        code: 'custom',
        message: 'Retenue de garantie : 0 à 10 % maximum (usage CCAG).',
      });
      return z.NEVER;
    }
    return n.toFixed(2);
  }),
);

export const sousTraitantSchema = z.object({
  code: codeMetier,
  nom: nomMetier,
  parentStId: parentStIdOptionnel,
  siret: siretOptionnel,
  nTvaIntra,
  email: emailOptionnel,
  telephone: telephoneOptionnel,
  ...adresseShape,
  assuranceDecennaleNum: z
    .string()
    .trim()
    .max(100, 'Numéro de police trop long.')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  assuranceDecennaleDateFin: dateOptionnelle,
  qualifications,
  agrementDc4: z.boolean().default(false),
  tauxRetenueGarantie,
  dateAttestationUrssaf: dateOptionnelle,
  statut: z.enum(STATUT_SOUS_TRAITANT_VALUES).default('a_qualifier'),
  actif: z.boolean().default(true),
});

export type SousTraitantInput = z.infer<typeof sousTraitantSchema>;

// ─────────────────────────────────────────────────────────────
// Documents administratifs (fournisseur + sous-traitant)
// ─────────────────────────────────────────────────────────────

/** Types de document administratif (miroir de l'enum SQL `type_document_tier`). */
export const TYPES_DOCUMENT_TIER = [
  'kbis',
  'attestation_urssaf',
  'assurance_decennale',
  'assurance_rc_pro',
  'attestation_fiscale',
  'attestation_regularite_sociale',
  'liste_salaries_etrangers',
  'qualification',
  'contrat_sous_traitance',
  'rib',
  'autre',
] as const;
export type TypeDocumentTier = (typeof TYPES_DOCUMENT_TIER)[number];

export const LIBELLES_TYPE_DOCUMENT_TIER: Record<TypeDocumentTier, string> = {
  kbis: 'Extrait K-BIS',
  attestation_urssaf: 'Attestation de vigilance URSSAF',
  assurance_decennale: 'Attestation assurance décennale',
  assurance_rc_pro: 'Attestation RC professionnelle',
  attestation_fiscale: 'Attestation de régularité fiscale',
  attestation_regularite_sociale: 'Attestation de régularité sociale',
  liste_salaries_etrangers: 'Liste nominative des salariés étrangers',
  qualification: 'Qualification (Qualibat, RGE…)',
  contrat_sous_traitance: 'Contrat de sous-traitance',
  rib: 'RIB',
  autre: 'Autre',
};

/**
 * Métadonnées d'un document importé. Le fichier est d'abord poussé en MinIO
 * (PUT direct depuis l'UI), puis ces métadonnées sont enregistrées en base —
 * même flux que pour les documents employés (`lib/validation/rh.ts`).
 */
export const documentTierSchema = z.object({
  type: z.enum(TYPES_DOCUMENT_TIER),
  libelle: z.string().trim().min(1, 'Libellé requis.').max(200, 'Libellé trop long.'),
  mimeType: z.string().trim().min(1).max(200),
  tailleBytes: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: 'custom', message: 'Taille invalide.' });
        return z.NEVER;
      }
      return n;
    }),
  minioKey: z.string().trim().min(1).max(500),
  dateValidite: dateOptionnelle,
  notes: z
    .string()
    .trim()
    .max(500, 'Notes trop longues (max 500 caractères).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type DocumentTierInput = z.infer<typeof documentTierSchema>;
