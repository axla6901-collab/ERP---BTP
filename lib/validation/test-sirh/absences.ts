import { z } from 'zod';

import { estDateIso } from '@/lib/test-sirh/calendrier';

import {
  couleurHex,
  dateRequise,
  decimalOptionnel,
  decimalRequis,
  entierRequis,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
  uuidRequis,
} from './commun';
import { CATEGORIES_ABSENCE, UNITES_DECOMPTE } from './enums';

/**
 * Schémas Zod — Test SIRH › Absences & compteurs (Factorial timeoff : LeaveType,
 * Allowance, AllowanceIncidence, Leave, BlockedPeriod ; holidays : CompanyHoliday).
 *
 * Les décisions (approuver / refuser) réutilisent `decisionSchema` (commun.ts).
 */

/** Date ISO `YYYY-MM-DD` requise ET existante au calendrier (refuse `2026-02-30`). */
const dateCalendaire = dateRequise.refine((v) => estDateIso(v), 'Date inexistante.');

/** Valeur maximale d'une colonne `numeric(6,2)`. */
const MAX_NUMERIC_6_2 = 9999.99;

const MESSAGE_FIN_AVANT_DEBUT = 'La date de fin doit être postérieure ou égale à la date de début.';

// ─────────────────────────────────────────────────────────────
// Types d'absence (Factorial LeaveType + Policy simplifiée)
// ─────────────────────────────────────────────────────────────

export const typeAbsenceSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string({ error: 'Code requis.' })
    .trim()
    .min(1, 'Code requis.')
    .max(12, 'Code trop long (max 12 caractères).')
    .regex(/^[A-Za-z0-9_-]+$/, 'Code : lettres, chiffres, « - » ou « _ » uniquement.')
    .transform((v) => v.toUpperCase()),
  libelle: texteRequis('Libellé', 120),
  categorie: z.enum(CATEGORIES_ABSENCE),
  uniteDecompte: z.enum(UNITES_DECOMPTE),
  avecSolde: z.boolean(),
  necessiteValidation: z.boolean(),
  justificatifRequis: z.boolean(),
  remuneree: z.boolean(),
  couleur: couleurHex,
  codeRubriquePaie: texteOptionnel(30),
  actif: z.boolean(),
  ordre: entierRequis('Ordre', { min: 0, max: 9999 }),
});
export type TypeAbsenceInput = z.infer<typeof typeAbsenceSchema>;

// ─────────────────────────────────────────────────────────────
// Demandes d'absence (Factorial Leave)
// ─────────────────────────────────────────────────────────────

export const demandeAbsenceSchema = z
  .object({
    employeId: uuidRequis('Employé'),
    typeAbsenceId: uuidRequis("Type d'absence"),
    dateDebut: dateCalendaire,
    dateFin: dateCalendaire,
    /** `true` = l'absence commence l'après-midi de `dateDebut`. */
    demiJourneeDebut: z.boolean(),
    /** `true` = l'absence se termine à midi le jour de `dateFin`. */
    demiJourneeFin: z.boolean(),
    /** Durée saisie — unité « heures » uniquement (sinon calculée au serveur). */
    dureeHeures: decimalOptionnel('Durée', { strictementPositif: true, max: MAX_NUMERIC_6_2 }),
    motif: texteOptionnel(1000),
    justificatifDocumentId: uuidOptionnel,
    /** Gestionnaire RH uniquement : enregistrer directement la demande comme approuvée. */
    approuverDirectement: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.dateFin < v.dateDebut) {
      ctx.addIssue({ code: 'custom', path: ['dateFin'], message: MESSAGE_FIN_AVANT_DEBUT });
    }
    if (v.dateDebut === v.dateFin && v.demiJourneeDebut && v.demiJourneeFin) {
      ctx.addIssue({
        code: 'custom',
        path: ['demiJourneeFin'],
        message: 'Sur une seule journée, choisissez le matin OU l’après-midi.',
      });
    }
  });
export type DemandeAbsenceInput = z.infer<typeof demandeAbsenceSchema>;

/** Identifiant d'absence (annulation). */
export const idAbsenceSchema = uuidRequis('Absence');

// ─────────────────────────────────────────────────────────────
// Compteurs & ajustements (Factorial Allowance / AllowanceIncidence)
// ─────────────────────────────────────────────────────────────

export const compteurSchema = z
  .object({
    id: z.string().uuid().optional(),
    employeId: uuidRequis('Employé'),
    typeAbsenceId: uuidRequis("Type d'absence"),
    periodeDebut: dateCalendaire,
    periodeFin: dateCalendaire,
    droitsAcquis: decimalRequis('Droits acquis', { min: 0, max: MAX_NUMERIC_6_2 }),
    report: decimalRequis('Report', { min: -MAX_NUMERIC_6_2, max: MAX_NUMERIC_6_2 }),
    notes: texteOptionnel(1000),
  })
  .superRefine((v, ctx) => {
    if (v.periodeFin < v.periodeDebut) {
      ctx.addIssue({ code: 'custom', path: ['periodeFin'], message: MESSAGE_FIN_AVANT_DEBUT });
    }
  });
export type CompteurInput = z.infer<typeof compteurSchema>;

export const ajustementSchema = z.object({
  compteurId: uuidRequis('Compteur'),
  dateAjustement: dateCalendaire,
  /** Valeur signée (+ crédit / − débit), dans l'unité du type d'absence. */
  valeur: decimalRequis('Valeur', { min: -MAX_NUMERIC_6_2, max: MAX_NUMERIC_6_2 }).refine(
    (v) => Number(v) !== 0,
    'La valeur ne peut pas être nulle (+ crédit, − débit).',
  ),
  motif: texteRequis('Motif', 500),
});
export type AjustementInput = z.infer<typeof ajustementSchema>;

/** Création groupée des compteurs d'un type pour tous les employés actifs. */
export const initialisationCompteursSchema = z
  .object({
    typeAbsenceId: uuidRequis("Type d'absence"),
    periodeDebut: dateCalendaire,
    periodeFin: dateCalendaire,
    droitsAcquis: decimalRequis('Droits acquis', { min: 0, max: MAX_NUMERIC_6_2 }),
  })
  .superRefine((v, ctx) => {
    if (v.periodeFin < v.periodeDebut) {
      ctx.addIssue({ code: 'custom', path: ['periodeFin'], message: MESSAGE_FIN_AVANT_DEBUT });
    }
  });
export type InitialisationCompteursInput = z.infer<typeof initialisationCompteursSchema>;

// ─────────────────────────────────────────────────────────────
// Jours fériés (Factorial CompanyHoliday)
// ─────────────────────────────────────────────────────────────

export const jourFerieSchema = z.object({
  id: z.string().uuid().optional(),
  dateFerie: dateCalendaire,
  libelle: texteRequis('Libellé', 120),
  /** NULL = tous les sites. */
  siteId: uuidOptionnel,
  /** Jour non travaillé (exclu du décompte des absences). */
  chome: z.boolean(),
});
export type JourFerieInput = z.infer<typeof jourFerieSchema>;

/** « Générer l'année N » : jours fériés légaux (option Alsace-Moselle), site optionnel. */
export const generationFeriesSchema = z.object({
  annee: entierRequis('Année', { min: 2000, max: 2100 }),
  alsaceMoselle: z.boolean(),
  siteId: uuidOptionnel,
});
export type GenerationFeriesInput = z.infer<typeof generationFeriesSchema>;

// ─────────────────────────────────────────────────────────────
// Périodes bloquées (Factorial BlockedPeriod)
// ─────────────────────────────────────────────────────────────

export const periodeBloqueeSchema = z
  .object({
    id: z.string().uuid().optional(),
    libelle: texteRequis('Libellé', 120),
    dateDebut: dateCalendaire,
    dateFin: dateCalendaire,
    /** NULL = tous les types soumis à validation. */
    typeAbsenceId: uuidOptionnel,
    /** NULL = toutes les équipes. */
    equipeId: uuidOptionnel,
    motif: texteOptionnel(500),
  })
  .superRefine((v, ctx) => {
    if (v.dateFin < v.dateDebut) {
      ctx.addIssue({ code: 'custom', path: ['dateFin'], message: MESSAGE_FIN_AVANT_DEBUT });
    }
  });
export type PeriodeBloqueeInput = z.infer<typeof periodeBloqueeSchema>;
