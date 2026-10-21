import { z } from 'zod';

import {
  dateRequise,
  decimalOptionnel,
  entierOptionnel,
  montantOptionnel,
  texteOptionnel,
  texteRequis,
  uuidRequis,
} from './commun';
import {
  CATEGORIES_FORMATION,
  MODALITES_FORMATION,
  RESULTATS_FORMATION,
  STATUTS_INSCRIPTION,
  STATUTS_SESSION,
} from './enums';

/**
 * Schémas Zod — Test SIRH › Formation.
 * Factorial : trainings/Training + Category (catalogue), Session,
 * TrainingMembership + SessionAttendance (inscriptions / présence).
 */

// ─────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────

export const formationSchema = z.object({
  id: z.string().uuid().optional(),
  code: texteOptionnel(30),
  intitule: texteRequis('Intitulé', 200),
  categorie: z.enum(CATEGORIES_FORMATION),
  organisme: texteOptionnel(200),
  modalite: z.enum(MODALITES_FORMATION),
  /** Durée en heures (numeric 6,2 — CHECK > 0). */
  dureeHeures: decimalOptionnel('Durée', { strictementPositif: true, max: 9999 }),
  /** Coût HT indicatif par participant. */
  coutHt: montantOptionnel('Coût HT'),
  obligatoire: z.boolean(),
  /** Validité de la qualification en mois (recyclage) — CHECK 1..240. */
  validiteMois: entierOptionnel('Validité', { min: 1, max: 240 }),
  description: texteOptionnel(2000),
  actif: z.boolean(),
});
export type FormationInput = z.infer<typeof formationSchema>;

// ─────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────

export const sessionSchema = z
  .object({
    id: z.string().uuid().optional(),
    formationId: uuidRequis('Formation'),
    dateDebut: dateRequise,
    dateFin: dateRequise,
    lieu: texteOptionnel(200),
    formateur: texteOptionnel(200),
    placesMax: entierOptionnel('Places', { min: 1, max: 999 }),
    /** Coût HT total de la session (vide = coût catalogue × participants). */
    coutHt: montantOptionnel('Coût HT'),
    statut: z.enum(STATUTS_SESSION),
    notes: texteOptionnel(2000),
  })
  .superRefine((v, ctx) => {
    if (v.dateFin < v.dateDebut) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFin'],
        message: 'La date de fin doit être postérieure ou égale à la date de début.',
      });
    }
  });
export type SessionInput = z.infer<typeof sessionSchema>;

// ─────────────────────────────────────────────────────────────
// Inscriptions
// ─────────────────────────────────────────────────────────────

/** Inscription d'un ou plusieurs collaborateurs à une session (doublons retirés). */
export const inscriptionsSchema = z.object({
  sessionId: uuidRequis('Session'),
  employeIds: z
    .array(uuidRequis('Collaborateur'))
    .min(1, 'Sélectionnez au moins un collaborateur.')
    .max(200, 'Au plus 200 collaborateurs par ajout.')
    .transform((ids) => [...new Set(ids)]),
});
export type InscriptionsInput = z.infer<typeof inscriptionsSchema>;

/** Présence, résultat et heures d'une inscription. */
export const inscriptionSchema = z
  .object({
    id: uuidRequis('Inscription'),
    statut: z.enum(STATUTS_INSCRIPTION),
    resultat: z.enum(RESULTATS_FORMATION),
    heuresRealisees: decimalOptionnel('Heures réalisées', { min: 0, max: 9999 }),
    commentaire: texteOptionnel(1000),
  })
  .superRefine((v, ctx) => {
    if (v.resultat !== 'non_evalue' && v.statut !== 'present') {
      ctx.addIssue({
        code: 'custom',
        path: ['resultat'],
        message: 'Seul un participant présent peut être évalué.',
      });
    }
  });
export type InscriptionInput = z.infer<typeof inscriptionSchema>;
