import { z } from 'zod';

import {
  dateOptionnelle,
  dateRequise,
  entierRequis,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
  uuidRequis,
} from './commun';
import { RESPONSABLES_TACHE, STATUTS_PROCESSUS, STATUTS_TACHE, TYPES_PROCESSUS } from './enums';

/**
 * Schémas Zod — Test SIRH › Onboarding / processus & tâches.
 * Factorial : processes/Process (modèles), MaterializedProcess (processus
 * lancés), tasks/Task (tâches).
 */

/** Sélection obligatoire d'un identifiant (message unique pour vide, null ou invalide). */
const choixRequis = (message: string) => z.string({ error: message }).trim().uuid(message);

/**
 * Compte utilisateur optionnel (vide → null). Les identifiants de comptes sont
 * des chaînes Better Auth, pas des UUID.
 */
const utilisateurOptionnel = texteOptionnel(100);

// ─────────────────────────────────────────────────────────────
// Modèles de processus
// ─────────────────────────────────────────────────────────────

export const modeleProcessusSchema = z.object({
  id: z.string().uuid().optional(),
  nom: texteRequis('Nom', 120),
  typeProcessus: z.enum(TYPES_PROCESSUS),
  description: texteOptionnel(1000),
  actif: z.boolean(),
});
export type ModeleProcessusInput = z.infer<typeof modeleProcessusSchema>;

/** Tâche d'un modèle : échéance relative à la date de référence (CHECK −365…365). */
export const modeleTacheSchema = z.object({
  id: z.string().uuid().optional(),
  modeleId: uuidRequis('Modèle'),
  libelle: texteRequis('Libellé', 200),
  description: texteOptionnel(2000),
  responsable: z.enum(RESPONSABLES_TACHE),
  delaiJours: entierRequis('Délai', { min: -365, max: 365 }),
});
export type ModeleTacheInput = z.infer<typeof modeleTacheSchema>;

export const deplacerModeleTacheSchema = z.object({
  id: uuidRequis('Tâche'),
  sens: z.enum(['haut', 'bas']),
});
export type DeplacerModeleTacheInput = z.infer<typeof deplacerModeleTacheSchema>;

// ─────────────────────────────────────────────────────────────
// Processus lancés
// ─────────────────────────────────────────────────────────────

/** Lancement d'un processus pour un collaborateur à partir d'un modèle actif. */
export const lancerProcessusSchema = z.object({
  modeleId: choixRequis('Choisissez un modèle.'),
  employeId: choixRequis('Choisissez un collaborateur.'),
  dateReference: dateRequise,
  libelle: texteRequis('Libellé', 200),
  /** Assigne les tâches RH au lanceur, salarié / manager à leur compte utilisateur. */
  assignationAuto: z.boolean(),
});
export type LancerProcessusInput = z.infer<typeof lancerProcessusSchema>;

export const statutProcessusSchema = z.object({
  id: uuidRequis('Processus'),
  statut: z.enum(STATUTS_PROCESSUS),
});
export type StatutProcessusInput = z.infer<typeof statutProcessusSchema>;

// ─────────────────────────────────────────────────────────────
// Tâches
// ─────────────────────────────────────────────────────────────

/**
 * Tâche ad hoc (dans un processus) ou autonome (sans processus, collaborateur
 * optionnel). En modification, `processusId` est ignoré (une tâche ne change
 * pas de processus) ; le statut se change par les actions dédiées.
 */
export const tacheSchema = z.object({
  id: z.string().uuid().optional(),
  processusId: uuidOptionnel,
  employeId: uuidOptionnel,
  libelle: texteRequis('Libellé', 200),
  description: texteOptionnel(2000),
  responsable: z.enum(RESPONSABLES_TACHE),
  assigneA: utilisateurOptionnel,
  echeance: dateOptionnelle,
});
export type TacheInput = z.infer<typeof tacheSchema>;

/** Cocher (faite) / décocher (à faire) une tâche. */
export const basculerTacheSchema = z.object({
  id: uuidRequis('Tâche'),
  faite: z.boolean(),
});
export type BasculerTacheInput = z.infer<typeof basculerTacheSchema>;

/** Changement de statut rapide d'une tâche. */
export const statutTacheSchema = z.object({
  id: uuidRequis('Tâche'),
  statut: z.enum(STATUTS_TACHE),
});
export type StatutTacheInput = z.infer<typeof statutTacheSchema>;
