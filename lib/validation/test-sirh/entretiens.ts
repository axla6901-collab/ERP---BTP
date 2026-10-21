import { z } from 'zod';

import { verifierCoherenceEntretien } from '@/lib/test-sirh/entretiens/statuts';

import {
  dateOptionnelle,
  entierOptionnel,
  entierRequis,
  noteOptionnelle,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
  uuidRequis,
} from './commun';
import { STATUTS_CAMPAGNE, STATUTS_ENTRETIEN, STATUTS_OBJECTIF, TYPES_ENTRETIEN } from './enums';

/**
 * Schémas Zod — Test SIRH › Entretiens & objectifs.
 * Factorial : performance/ReviewProcess (campagnes), ReviewEvaluation
 * (entretiens), ReviewProcessTarget (objectifs).
 */

// ─────────────────────────────────────────────────────────────
// Campagnes
// ─────────────────────────────────────────────────────────────

export const campagneSchema = z
  .object({
    id: z.string().uuid().optional(),
    libelle: texteRequis('Libellé', 160),
    typeEntretien: z.enum(TYPES_ENTRETIEN),
    dateDebut: dateOptionnelle,
    dateLimite: dateOptionnelle,
    description: texteOptionnel(2000),
  })
  .superRefine((v, ctx) => {
    if (v.dateDebut && v.dateLimite && v.dateLimite < v.dateDebut) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateLimite'],
        message: 'La date limite doit être postérieure à la date de début.',
      });
    }
  });
export type CampagneInput = z.infer<typeof campagneSchema>;

/** « Lancer la campagne » : un entretien par employé actif (filtres optionnels). */
export const lancementCampagneSchema = z.object({
  campagneId: uuidRequis('Campagne'),
  siteId: uuidOptionnel,
  equipeId: uuidOptionnel,
});
export type LancementCampagneInput = z.infer<typeof lancementCampagneSchema>;

export const changementStatutCampagneSchema = z.object({
  id: uuidRequis('Campagne'),
  statut: z.enum(STATUTS_CAMPAGNE),
});

// ─────────────────────────────────────────────────────────────
// Entretiens
// ─────────────────────────────────────────────────────────────

/** Création d'un entretien (hors campagne ou rattaché à une campagne). */
export const nouvelEntretienSchema = z
  .object({
    campagneId: uuidOptionnel,
    employeId: uuidRequis('Collaborateur'),
    evaluateurId: uuidOptionnel,
    typeEntretien: z.enum(TYPES_ENTRETIEN),
    datePrevue: dateOptionnelle,
  })
  .superRefine((v, ctx) => {
    if (v.evaluateurId && v.evaluateurId === v.employeId) {
      ctx.addIssue({
        code: 'custom',
        path: ['evaluateurId'],
        message: 'L’évaluateur doit être une autre personne que le collaborateur.',
      });
    }
  });
export type NouvelEntretienInput = z.infer<typeof nouvelEntretienSchema>;

/** Planification d'un entretien existant (évaluateur, type, date prévue). */
export const planificationEntretienSchema = z.object({
  id: uuidRequis('Entretien'),
  evaluateurId: uuidOptionnel,
  typeEntretien: z.enum(TYPES_ENTRETIEN),
  datePrevue: dateOptionnelle,
});
export type PlanificationEntretienInput = z.infer<typeof planificationEntretienSchema>;

const texteCompteRendu = texteOptionnel(5000);

/** Compte rendu (modifiable par la RH et par l'évaluateur). */
export const compteRenduSchema = z
  .object({
    id: uuidRequis('Entretien'),
    statut: z.enum(STATUTS_ENTRETIEN),
    datePrevue: dateOptionnelle,
    dateRealisation: dateOptionnelle,
    noteGlobale: noteOptionnelle,
    synthese: texteCompteRendu,
    pointsForts: texteCompteRendu,
    axesAmelioration: texteCompteRendu,
    souhaitsFormation: texteCompteRendu,
    souhaitsEvolution: texteCompteRendu,
    commentaireSalarie: texteCompteRendu,
  })
  .superRefine((v, ctx) => {
    const incoherence = verifierCoherenceEntretien(v);
    if (incoherence) {
      ctx.addIssue({ code: 'custom', path: [incoherence.champ], message: incoherence.message });
    }
  });
export type CompteRenduInput = z.infer<typeof compteRenduSchema>;

/** Commentaire du salarié sur son propre entretien (« Mon espace »). */
export const commentaireSalarieSchema = z.object({
  id: uuidRequis('Entretien'),
  commentaireSalarie: texteCompteRendu,
});
export type CommentaireSalarieInput = z.infer<typeof commentaireSalarieSchema>;

// ─────────────────────────────────────────────────────────────
// Objectifs
// ─────────────────────────────────────────────────────────────

export const objectifSchema = z.object({
  id: z.string().uuid().optional(),
  employeId: uuidRequis('Collaborateur'),
  entretienId: uuidOptionnel,
  libelle: texteRequis('Libellé', 200),
  description: texteOptionnel(2000),
  dateEcheance: dateOptionnelle,
  poids: entierOptionnel('Poids', { min: 0, max: 100 }),
  progression: entierRequis('Progression', { min: 0, max: 100 }),
  statut: z.enum(STATUTS_OBJECTIF),
});
export type ObjectifInput = z.infer<typeof objectifSchema>;
