import { z } from 'zod';

/**
 * Schemas Zod du module Référencement & Agrément des tiers
 * (FEB_Contrôle Artisans, chapitres 1 à 4).
 *
 * Couvre : registre des tiers, référentiels paramétrables (corps d'état,
 * natures de document, correspondance, sociétés + règles, matrice types
 * d'engagement) et la gestion documentaire / agrément.
 */

// ─────────────────────────────────────────────────────────────
// Activation du module complémentaire (flag entreprise)
// ─────────────────────────────────────────────────────────────

export const tiersReferencementFlagSchema = z.object({
  actif: z.boolean(),
});
export type TiersReferencementFlagInput = z.infer<typeof tiersReferencementFlagSchema>;

// ─────────────────────────────────────────────────────────────
// Enums (listes partagées UI ↔ DB)
// ─────────────────────────────────────────────────────────────

export const NATURES_TIERS = ['artisan', 'artisan_ae', 'fournisseur', 'fournisseur_artisan'] as const;
export type NatureTiers = (typeof NATURES_TIERS)[number];

export const LIBELLES_NATURE_TIERS: Record<NatureTiers, string> = {
  artisan: 'Artisan',
  artisan_ae: 'Artisan auto-entrepreneur',
  fournisseur: 'Fournisseur',
  fournisseur_artisan: 'Fournisseur / Artisan',
};

export const TYPES_ENGAGEMENT = ['marche_travaux', 'bon_commande'] as const;
export type TypeEngagement = (typeof TYPES_ENGAGEMENT)[number];

export const LIBELLES_TYPE_ENGAGEMENT: Record<TypeEngagement, string> = {
  marche_travaux: 'Marché de travaux',
  bon_commande: 'Bon de commande',
};

export const MODES_CONTROLE_DOCUMENT = [
  'duree_jours',
  'date_fin_assurance',
  'case_a_cocher',
  'date_obtention',
] as const;
export type ModeControleDocument = (typeof MODES_CONTROLE_DOCUMENT)[number];

export const LIBELLES_MODE_CONTROLE: Record<ModeControleDocument, string> = {
  duree_jours: 'Durée de validité (jours)',
  date_fin_assurance: "Date de fin (assurance) + tolérance",
  case_a_cocher: 'Case à cocher (présence)',
  date_obtention: "Date d'obtention (sans expiration)",
};

export const STATUTS_AGREMENT = [
  'a_creer',
  'en_attente_documents',
  'agree',
  'refuse_auto',
  'refuse_manuel',
  'suspendu',
] as const;
export type StatutAgrement = (typeof STATUTS_AGREMENT)[number];

export const LIBELLES_STATUT_AGREMENT: Record<StatutAgrement, string> = {
  a_creer: 'À créer',
  en_attente_documents: 'En attente de documents',
  agree: 'Agréé',
  refuse_auto: 'Refusé (auto)',
  refuse_manuel: 'Refusé',
  suspendu: 'Suspendu',
};

export const STATUTS_DOCUMENT_TIER = [
  'en_attente_validation',
  'valide',
  'expire',
  'a_renouveler',
  'refuse',
] as const;
export type StatutDocumentTier = (typeof STATUTS_DOCUMENT_TIER)[number];

// ─────────────────────────────────────────────────────────────
// Primitives réutilisables
// ─────────────────────────────────────────────────────────────

const codeRef = z
  .string()
  .trim()
  .min(2, 'Code trop court (min 2 caractères).')
  .max(32, 'Code trop long (max 32 caractères).')
  .regex(/^[A-Z0-9._-]+$/i, 'Code invalide : lettres, chiffres, points, tirets, underscores.')
  .transform((v) => v.toUpperCase());

const libelleRef = z
  .string()
  .trim()
  .min(2, 'Libellé trop court (min 2 caractères).')
  .max(200, 'Libellé trop long (max 200 caractères).');

const ordreAffichage = z.coerce
  .number()
  .int('Entier requis.')
  .min(0, 'Doit être ≥ 0.')
  .max(9999, 'Trop grand.')
  .default(0);

const entierJoursOptionnel = z
  .union([z.coerce.number().int('Entier requis.').min(0, 'Doit être ≥ 0.').max(36500, 'Trop grand.'), z.null()])
  .optional()
  .transform((v) => (v === undefined || v === null || Number.isNaN(v) ? null : v));

const siretOptionnel = z
  .string()
  .trim()
  .regex(/^\d{14}$/, 'SIRET invalide (14 chiffres requis).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const nTvaIntraOptionnel = z
  .string()
  .trim()
  .regex(/^[A-Z]{2}[A-Z0-9]{2,13}$/i, 'N° TVA intracom invalide (ex. FR12345678901).')
  .transform((v) => v.toUpperCase())
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

const texteCourtOptionnel = (max: number, label = 'Texte') =>
  z
    .string()
    .trim()
    .max(max, `${label} trop long (max ${max}).`)
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

const uuidOptionnel = z
  .string()
  .uuid('Identifiant invalide.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const adresseShape = {
  adresseLigne1: texteCourtOptionnel(200, 'Adresse'),
  adresseLigne2: texteCourtOptionnel(200, 'Adresse'),
  codePostal: z
    .string()
    .trim()
    .regex(/^[0-9]{5}$/, 'Code postal invalide (5 chiffres).')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  ville: texteCourtOptionnel(100, 'Ville'),
  pays: z.string().trim().min(1).max(100).default('France'),
} as const;

// ─────────────────────────────────────────────────────────────
// Référentiel : corps d'état
// ─────────────────────────────────────────────────────────────

export const corpsEtatSchema = z.object({
  code: codeRef,
  libelle: libelleRef,
  ordreAffichage,
  actif: z.boolean().default(true),
});
export type CorpsEtatInput = z.infer<typeof corpsEtatSchema>;

// ─────────────────────────────────────────────────────────────
// Référentiel : nature de document
// ─────────────────────────────────────────────────────────────

export const natureDocumentSchema = z
  .object({
    code: codeRef,
    libelle: libelleRef,
    modeControle: z.enum(MODES_CONTROLE_DOCUMENT),
    delaiValiditeJours: entierJoursOptionnel,
    delaiRelanceJours: entierJoursOptionnel,
    ordreAffichage,
    actif: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    // duree_jours et date_fin_assurance s'appuient sur un délai en jours.
    if (
      (val.modeControle === 'duree_jours' || val.modeControle === 'date_fin_assurance') &&
      val.delaiValiditeJours === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['delaiValiditeJours'],
        message: 'Délai de validité requis pour ce mode de contrôle.',
      });
    }
    // case_a_cocher / date_obtention : pas de durée de validité.
    if (
      (val.modeControle === 'case_a_cocher' || val.modeControle === 'date_obtention') &&
      val.delaiValiditeJours !== null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['delaiValiditeJours'],
        message: 'Pas de délai de validité pour ce mode de contrôle.',
      });
    }
  });
export type NatureDocumentInput = z.infer<typeof natureDocumentSchema>;

// ─────────────────────────────────────────────────────────────
// Référentiel : correspondance corps d'état × nature × document
// (édition par lot : ensemble des lignes "requises" pour un corps d'état)
// ─────────────────────────────────────────────────────────────

export const correspondanceLigneSchema = z.object({
  natureDocumentId: z.string().uuid(),
  natureTiers: z.enum(NATURES_TIERS),
  estBloquant: z.boolean().default(true),
});

export const correspondanceBatchSchema = z.object({
  corpsEtatId: z.string().uuid(),
  lignes: z.array(correspondanceLigneSchema).max(500),
});
export type CorrespondanceBatchInput = z.infer<typeof correspondanceBatchSchema>;

// ─────────────────────────────────────────────────────────────
// Référentiel : sociétés + règles
// ─────────────────────────────────────────────────────────────

export const societeSchema = z.object({
  code: codeRef,
  raisonSociale: libelleRef,
  siret: siretOptionnel,
  actif: z.boolean().default(true),
});
export type SocieteInput = z.infer<typeof societeSchema>;

export const societeRegleSchema = z.object({
  codeRegle: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9._-]+$/i, 'Code règle invalide.')
    .transform((v) => v.toUpperCase()),
  libelle: libelleRef,
  applique: z.boolean().default(false),
  description: texteCourtOptionnel(1000, 'Description'),
});
export type SocieteRegleInput = z.infer<typeof societeRegleSchema>;

// ─────────────────────────────────────────────────────────────
// Référentiel : matrice nature_tiers × type_engagement (globale)
// ─────────────────────────────────────────────────────────────

export const matriceEngagementBatchSchema = z.array(
  z.object({
    natureTiers: z.enum(NATURES_TIERS),
    typeEngagement: z.enum(TYPES_ENGAGEMENT),
    autorise: z.boolean(),
  }),
);
export type MatriceEngagementBatchInput = z.infer<typeof matriceEngagementBatchSchema>;

// ─────────────────────────────────────────────────────────────
// Registre des tiers
// ─────────────────────────────────────────────────────────────

export const tierSchema = z.object({
  code: codeRef,
  nom: libelleRef,
  natureTiers: z.enum(NATURES_TIERS),
  nomGerant: texteCourtOptionnel(200, 'Nom du gérant'),
  telPortableGerant: telephoneOptionnel,
  siret: siretOptionnel,
  nTvaIntra: nTvaIntraOptionnel,
  email: emailOptionnel,
  telephone: telephoneOptionnel,
  ...adresseShape,
  corpsEtatIds: z.array(z.string().uuid()).max(50).default([]),
  societeIds: z.array(z.string().uuid()).max(50).default([]),
  cdtResponsableId: uuidOptionnel,
  managerCdtId: uuidOptionnel,
  actif: z.boolean().default(true),
});
export type TierInput = z.infer<typeof tierSchema>;

// ─────────────────────────────────────────────────────────────
// Documents du tier (enregistrement après upload MinIO)
// ─────────────────────────────────────────────────────────────

export const tierDocumentSchema = z.object({
  natureDocumentId: z.string().uuid('Nature de document requise.'),
  minioKey: z.string().trim().min(1, 'Clé de stockage manquante.'),
  nomFichierOrigine: texteCourtOptionnel(255, 'Nom de fichier'),
  mimeType: z.string().trim().max(150).optional().nullable().transform((v) => (v && v.length > 0 ? v : null)),
  tailleBytes: z.coerce.number().int().positive().optional().nullable().transform((v) => v ?? null),
  dateObtention: dateOptionnelle,
  dateFinValidite: dateOptionnelle,
  notes: texteCourtOptionnel(1000, 'Notes'),
});
export type TierDocumentInput = z.infer<typeof tierDocumentSchema>;

// ─────────────────────────────────────────────────────────────
// Actions d'agrément (manuel)
// ─────────────────────────────────────────────────────────────

export const ACTIONS_AGREMENT = ['agreer', 'refuser', 'suspendre', 'reactiver'] as const;
export type ActionAgrement = (typeof ACTIONS_AGREMENT)[number];

export const agrementActionSchema = z
  .object({
    action: z.enum(ACTIONS_AGREMENT),
    motif: texteCourtOptionnel(1000, 'Motif'),
  })
  .superRefine((val, ctx) => {
    if (val.action === 'refuser' && !val.motif) {
      ctx.addIssue({
        code: 'custom',
        path: ['motif'],
        message: "Motif requis pour un refus d'agrément.",
      });
    }
  });
export type AgrementActionInput = z.infer<typeof agrementActionSchema>;

export const refusDocumentSchema = z.object({
  motif: z.string().trim().min(1, 'Motif requis.').max(1000, 'Motif trop long.'),
});
export type RefusDocumentInput = z.infer<typeof refusDocumentSchema>;
