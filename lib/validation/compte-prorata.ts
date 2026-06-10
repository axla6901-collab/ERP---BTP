import { z } from 'zod';

/**
 * Schémas de validation du module Compte prorata (NF P03-001).
 * Cf. db/migrations/0062_compte_prorata_module.sql pour les contraintes DB.
 *
 * Les montants/pourcentages sont saisis librement (point ou virgule décimale) ;
 * les helpers normalisent en `number`. Les Server Actions convertissent ensuite
 * en chaîne NUMERIC via `.toFixed(2)`.
 */

const dateISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

/** Montant strictement positif (dépense). */
const montantPositif = z.preprocess(
  (v) => (typeof v === 'string' ? Number(v.replace(',', '.')) : v),
  z.number({ message: 'Montant invalide.' }).positive('Le montant doit être supérieur à 0.'),
);

/** Montant ≥ 0 (montant de marché ; vide ⇒ 0). */
const montantPositifOuNul = z.preprocess(
  (v) => {
    if (v === '' || v === null || v === undefined) return 0;
    return typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  },
  z.number({ message: 'Montant invalide.' }).min(0, 'Le montant ne peut pas être négatif.'),
);

/** Pourcentage 0–100, nullable (vide ⇒ null). Utilisé pour quote-part manuelle et frais de gestion. */
const pourcentNullable = z.preprocess(
  (v) => {
    if (v === '' || v === null || v === undefined) return null;
    return typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  },
  z
    .number({ message: 'Pourcentage invalide.' })
    .min(0, 'Le pourcentage ne peut pas être négatif.')
    .max(100, 'Le pourcentage ne peut pas dépasser 100.')
    .nullable(),
);

// ─────────────────────────────────────────────────────────────
// Feature flag
// ─────────────────────────────────────────────────────────────

export const compteProrataFlagSchema = z.object({ actif: z.boolean() });
export type CompteProrataFlagInput = z.infer<typeof compteProrataFlagSchema>;

// ─────────────────────────────────────────────────────────────
// Compte (ouverture / paramètres)
// ─────────────────────────────────────────────────────────────

export const ouvrirCompteProrataSchema = z.object({
  chantierId: z.string().uuid(),
  fraisGestionPct: pourcentNullable,
});
export type OuvrirCompteProrataInput = z.infer<typeof ouvrirCompteProrataSchema>;

export const parametresCompteProrataSchema = z.object({
  compteProrataId: z.string().uuid(),
  fraisGestionPct: pourcentNullable,
  notes: z.string().trim().max(5000).nullable().optional(),
});
export type ParametresCompteProrataInput = z.infer<typeof parametresCompteProrataSchema>;

// ─────────────────────────────────────────────────────────────
// Participant (création + mise à jour selon présence de `id`)
// ─────────────────────────────────────────────────────────────

export const compteProrataParticipantSchema = z.object({
  id: z.string().uuid().optional(),
  compteProrataId: z.string().uuid(),
  sousTraitantId: z.string().uuid().nullable().optional(),
  libelle: z.string().trim().min(1, 'Libellé requis').max(200),
  montantMarcheHt: montantPositifOuNul,
  quotePartPctManuel: pourcentNullable,
  estGestionnaire: z.boolean().default(false),
  ordre: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
export type CompteProrataParticipantInput = z.infer<typeof compteProrataParticipantSchema>;

// ─────────────────────────────────────────────────────────────
// Dépense commune (création + mise à jour selon présence de `id`)
// ─────────────────────────────────────────────────────────────

export const compteProrataDepenseSchema = z.object({
  id: z.string().uuid().optional(),
  compteProrataId: z.string().uuid(),
  avanceParParticipantId: z.string().uuid('Indiquez qui a avancé la dépense.'),
  dateDepense: dateISO,
  libelle: z.string().trim().min(1, 'Libellé requis').max(200),
  categorie: z.string().trim().max(60).nullable().optional(),
  montantHt: montantPositif,
  notes: z.string().trim().max(5000).nullable().optional(),
});
export type CompteProrataDepenseInput = z.infer<typeof compteProrataDepenseSchema>;

// ─────────────────────────────────────────────────────────────
// Arrêté de compte
// ─────────────────────────────────────────────────────────────

export const arreterCompteProrataSchema = z.object({
  compteProrataId: z.string().uuid(),
  dateArrete: dateISO,
});
export type ArreterCompteProrataInput = z.infer<typeof arreterCompteProrataSchema>;
