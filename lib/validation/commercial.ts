import { z } from 'zod';

import {
  refineRemiseGlobale,
  remiseGlobaleTypeField,
  remiseGlobaleValeurField,
} from '@/lib/remise-globale';

/**
 * Schemas Zod pour le module commercial (M3.1) :
 * - Clients (particulier vs professionnel, union discriminée)
 * - Lignes de devis (3 types : section / article_catalogue / libre)
 * - Devis (en-tête + lignes)
 */

const codeMetier = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[A-Z0-9._-]+$/i, 'Code invalide.')
  .transform((v) => v.toUpperCase());

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

// ─────────────────────────────────────────────────────────────
// Clients
// ─────────────────────────────────────────────────────────────

const codePostalFR = z.string().trim().regex(/^\d{5}$/, 'Code postal invalide (5 chiffres).');

/**
 * Normalise toute valeur "vide" venant du form (chaîne vide, espaces, null, undefined)
 * vers `null` AVANT que la validation principale ne s'applique. Évite que les regex
 * (email, SIRET, TVA…) ne rejettent une saisie laissée vide intentionnellement.
 */
const emptyToNull = (v: unknown): unknown => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim().length === 0) return null;
  return v;
};

const emailOptional = z.preprocess(
  emptyToNull,
  z.union([
    z.null(),
    z.email('Email invalide.').max(200),
  ]),
);

const siretSchema = z.preprocess(
  emptyToNull,
  z.union([
    z.null(),
    z.string().trim().regex(/^\d{14}$/, 'SIRET invalide (14 chiffres requis).'),
  ]),
);

const tvaIntraSchema = z.preprocess(
  emptyToNull,
  z
    .union([
      z.null(),
      z.string().trim().regex(/^FR\d{11}$/i, 'N° TVA invalide (format FR + 11 chiffres).'),
    ])
    .transform((v) => (typeof v === 'string' ? v.toUpperCase() : v)),
);

const forcedNull = z.preprocess(emptyToNull, z.null());

const baseClientFields = {
  code: codeMetier,
  email: emailOptional,
  telephone: trimmedOptionalString(30),
  adresseLigne1: z.string().trim().min(2, 'Adresse requise.').max(200),
  adresseLigne2: trimmedOptionalString(200),
  codePostal: codePostalFR,
  ville: z.string().trim().min(2, 'Ville requise.').max(100),
  pays: z.string().trim().min(2).max(100).default('France'),
  notes: trimmedOptionalString(2000),
  actif: z.boolean().default(true),
};

export const clientSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('particulier'),
    nom: z.string().trim().min(2, 'Nom requis.').max(100),
    prenom: trimmedOptionalString(100),
    raisonSociale: forcedNull,
    siret: forcedNull,
    tvaIntra: forcedNull,
    ...baseClientFields,
  }),
  z.object({
    type: z.literal('professionnel'),
    raisonSociale: z.string().trim().min(2, 'Raison sociale requise.').max(200),
    nom: trimmedOptionalString(100),
    prenom: trimmedOptionalString(100),
    siret: siretSchema,
    tvaIntra: tvaIntraSchema,
    ...baseClientFields,
  }),
]);

export type ClientInput = z.infer<typeof clientSchema>;

// ─────────────────────────────────────────────────────────────
// Lignes de devis
// ─────────────────────────────────────────────────────────────

const TAUX_TVA_FR = ['0.00', '2.10', '5.50', '10.00', '20.00'] as const;
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
  composants: z.array(z.never()).optional().default([]),
  /** True si la ligne provient d'un import DPGF (lecture seule structurelle). */
  origineDpgf: z.boolean().optional().default(false),
});

/**
 * Composant attaché à une ligne de devis. Plusieurs composants
 * ensemble permettent de « chiffrer » la ligne : le PU de la ligne est
 * dérivé de Σ (quantite_par_unite × prix_unitaire_ht).
 *
 * Deux variantes :
 * - `article_catalogue` : référence un article du catalogue (articleId UUID).
 *   Le libellé est tiré du catalogue à l'affichage.
 * - `libre` : désignation saisie à la main (pas de référence catalogue).
 *
 * `quantiteParUnite` est exprimé par unité de la ligne parent
 * (ex : 12 agglos par m² de mur).
 */
const composantBase = {
  quantiteParUnite: numericStrictlyPositive('Quantité par unité'),
  prixUnitaireHt: numericPrix('Prix unitaire HT', true),
  notes: trimmedOptionalString(500),
};

/**
 * Override optionnel de TVA ou remise sur un composant. `null` (ou vide) =
 * hérite de la ligne parente. Valeur numérique = remplace la valeur de la
 * ligne pour la contribution de ce composant aux totaux.
 */
const composantOverrideTaux = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isNaN(n) || n < 0 || n > 100) {
      ctx.addIssue({ code: 'custom', message: 'Taux invalide (0 à 100).' });
      return z.NEVER;
    }
    return n.toFixed(2);
  })
  .default(null);

const composantCatalogueSchema = z.object({
  type: z.literal('article_catalogue'),
  articleId: z.uuid('Article catalogue invalide.'),
  designation: z.null().optional().default(null),
  tauxTva: z.null().optional().default(null),
  remisePourcent: z.null().optional().default(null),
  ...composantBase,
});

const composantLibreSchema = z.object({
  type: z.literal('libre'),
  articleId: z.null().optional().default(null),
  designation: z.string().trim().min(1, 'Désignation requise.').max(500),
  tauxTva: composantOverrideTaux,
  remisePourcent: composantOverrideTaux,
  ...composantBase,
});

export const composantLigneSchema = z.discriminatedUnion('type', [
  composantCatalogueSchema,
  composantLibreSchema,
]);

export type ComposantLigneInput = z.infer<typeof composantLigneSchema>;

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
  /** Catalogue articles chiffrant cette ligne. Si non vide, le PU stocké
   *  côté serveur est recalculé : Σ (qte_par_unite × pu). Sinon, le PU
   *  saisi manuellement est conservé. */
  composants: z.array(composantLigneSchema).default([]),
  /** True si la ligne provient d'un import DPGF. */
  origineDpgf: z.boolean().optional().default(false),
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

export const ligneDevisSchema = z.discriminatedUnion('type', [
  sectionLigneSchema,
  articleCatalogueLigneSchema,
  libreLigneSchema,
]);

export type LigneDevisInput = z.infer<typeof ligneDevisSchema>;

// ─────────────────────────────────────────────────────────────
// Postes internes ventilés
// ─────────────────────────────────────────────────────────────

export const PORTEES_POSTE_INTERNE = ['devis', 'chapitre'] as const;
export type PorteePosteInterne = (typeof PORTEES_POSTE_INTERNE)[number];

const numericPoidsLigne = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: 'custom', message: 'Poids invalide.' });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Poids négatif interdit.' });
      return z.NEVER;
    }
    return n.toFixed(4);
  });

/**
 * Format du form devis : un poste interne référence les lignes du devis
 * par leur **ordre** (index dans le tableau `lignes`) plutôt que par UUID,
 * car les UUIDs ne sont attribués qu'à l'insertion et changent à chaque
 * mise à jour (delete + insert atomique).
 */
const repartitionPosteInterneFormSchema = z.object({
  ordreLigne: z.number().int().nonnegative('Ordre invalide.'),
  poids: numericPoidsLigne,
});

export type RepartitionPosteInterneFormInput = z.infer<
  typeof repartitionPosteInterneFormSchema
>;

const baseInternePoste = {
  libelle: z.string().trim().min(1, 'Libellé requis.').max(200),
  montantHt: numericPrix('Montant HT', false),
  notes: trimmedOptionalString(500),
  /** Tableau des poids par ligne du devis. Vide = uniforme. Doublons rejetés. */
  repartitions: z
    .array(repartitionPosteInterneFormSchema)
    .default([])
    .refine(
      (arr) => new Set(arr.map((r) => r.ordreLigne)).size === arr.length,
      { message: 'Doublon dans les répartitions.' },
    ),
};

export const posteInterneFormSchema = z.discriminatedUnion('portee', [
  z.object({
    portee: z.literal('devis'),
    chapitreOrdre: z.preprocess(emptyToNull, z.null()),
    ...baseInternePoste,
  }),
  z.object({
    portee: z.literal('chapitre'),
    chapitreOrdre: z.number().int().nonnegative('Chapitre invalide.'),
    ...baseInternePoste,
  }),
]);

export type PosteInterneFormInput = z.infer<typeof posteInterneFormSchema>;

// ─────────────────────────────────────────────────────────────
// Devis
// ─────────────────────────────────────────────────────────────

export const devisSchema = z
  .object({
    clientId: z.uuid('Client invalide.'),
    dateDevis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).'),
    dateValidite: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date validité invalide (YYYY-MM-DD).'),
    objet: trimmedOptionalString(200),
    conditionsGenerales: trimmedOptionalString(5000),
    notes: trimmedOptionalString(2000),
    lignes: z.array(ligneDevisSchema).min(1, 'Au moins une ligne requise.'),
    /** Postes internes ventilés (frais généraux, aléas, marge…) invisibles
     *  pour le client. Voir [[lib/commercial/ventilation.ts]]. */
    postesInternes: z.array(posteInterneFormSchema).default([]),
    /** Remise globale sur le total HT (en plus des remises par ligne).
     *  Voir [[lib/remise-globale.ts]]. */
    remiseGlobaleType: remiseGlobaleTypeField,
    remiseGlobaleValeur: remiseGlobaleValeurField,
  })
  .superRefine(refineRemiseGlobale);

export type DevisInput = z.infer<typeof devisSchema>;

export const STATUTS_DEVIS = [
  'brouillon',
  'en_validation',
  'refuse',
  'valide',
  'envoye',
  'gagne',
  'perdu',
  'annule',
] as const;
export type StatutDevis = (typeof STATUTS_DEVIS)[number];

export const LIBELLES_STATUT_DEVIS: Record<StatutDevis, string> = {
  brouillon: 'Brouillon',
  en_validation: 'En validation',
  refuse: 'Refusé',
  valide: 'Validé',
  envoye: 'Envoyé',
  gagne: 'Gagné',
  perdu: 'Perdu',
  annule: 'Annulé',
};

/** Transitions autorisées entre statuts. Source de vérité partagée entre
 *  serveur (validation) et client (affichage des actions possibles).
 *
 *  Note : le refus d'un devis en validation le renvoie en `brouillon`
 *  (UX simplifiée — le statut `refuse` reste défini pour les devis
 *  historiques mais n'est plus une cible de transition depuis en_validation).
 *  Les devis encore en `refuse` peuvent toujours être resoumis ou annulés. */
export const TRANSITIONS_STATUT_DEVIS: Record<StatutDevis, readonly StatutDevis[]> = {
  brouillon: ['en_validation', 'annule'],
  en_validation: ['valide', 'brouillon', 'annule'],
  refuse: ['en_validation', 'annule'],
  valide: ['envoye', 'annule'],
  envoye: ['gagne', 'perdu', 'annule'],
  gagne: [],
  perdu: [],
  annule: [],
};

/** Transitions réservées au rôle valideur (permission COMMERCIAL_DEVIS_VALIDER).
 *  Pour les autres transitions, le droit d'écriture commercial suffit.
 *  Le refus (en_validation → brouillon) est gated valideur car c'est une
 *  décision de validation, pas une simple correction. */
export const TRANSITIONS_VALIDEUR: ReadonlyArray<{
  from: StatutDevis;
  to: StatutDevis;
}> = [
  { from: 'en_validation', to: 'valide' },
  { from: 'en_validation', to: 'brouillon' },
];

export { TAUX_TVA_FR };
