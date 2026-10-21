import { z } from 'zod';

import {
  codePostalOptionnel,
  couleurHex,
  dateOptionnelle,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
  uuidRequis,
} from './commun';
import { CATEGORIES_PROFESSIONNELLES, TYPES_SITE } from './enums';

/**
 * Schémas Zod — Test SIRH › Organisation (sites, équipes, postes).
 * Factorial : locations/Location, teams/Team + Membership, job_catalog.
 */

// ─────────────────────────────────────────────────────────────
// Sites (lieux de travail)
// ─────────────────────────────────────────────────────────────

export const siteSchema = z.object({
  id: z.string().uuid().optional(),
  code: texteOptionnel(20),
  nom: texteRequis('Nom', 120),
  typeSite: z.enum(TYPES_SITE),
  adresseLigne1: texteOptionnel(200),
  adresseLigne2: texteOptionnel(200),
  codePostal: codePostalOptionnel,
  ville: texteOptionnel(120),
  pays: texteRequis('Pays', 80),
  telephone: texteOptionnel(30),
  actif: z.boolean(),
  notes: texteOptionnel(1000),
});
export type SiteInput = z.infer<typeof siteSchema>;

// ─────────────────────────────────────────────────────────────
// Équipes (Factorial teams/Team)
// ─────────────────────────────────────────────────────────────

/** Couleur proposée par défaut (ambre du module, = DEFAULT SQL). */
export const COULEUR_EQUIPE_DEFAUT = '#f59e0b';

export const equipeSchema = z.object({
  id: z.string().uuid().optional(),
  nom: texteRequis('Nom', 120),
  description: texteOptionnel(1000),
  /** Responsable de l'équipe (employé). */
  responsableId: uuidOptionnel,
  siteId: uuidOptionnel,
  couleur: couleurHex,
  actif: z.boolean(),
});
export type EquipeInput = z.infer<typeof equipeSchema>;

// ─────────────────────────────────────────────────────────────
// Membres d'équipe (Factorial teams/Membership)
// ─────────────────────────────────────────────────────────────

export const membreEquipeSchema = z
  .object({
    /** Présent = modification d'une appartenance existante. */
    id: z.string().uuid().optional(),
    equipeId: uuidRequis('Équipe'),
    employeId: uuidRequis('Collaborateur'),
    estResponsable: z.boolean(),
    dateDebut: dateOptionnelle,
    dateFin: dateOptionnelle,
  })
  .refine((v) => !v.dateDebut || !v.dateFin || v.dateFin >= v.dateDebut, {
    message: 'La date de fin doit être postérieure ou égale à la date de début.',
    path: ['dateFin'],
  });
export type MembreEquipeInput = z.infer<typeof membreEquipeSchema>;

// ─────────────────────────────────────────────────────────────
// Catalogue des postes (Factorial job_catalog Role + Level)
// ─────────────────────────────────────────────────────────────

export const posteSchema = z.object({
  id: z.string().uuid().optional(),
  code: texteOptionnel(20),
  intitule: texteRequis('Intitulé', 120),
  /** Famille métier libre (Gros œuvre, Second œuvre, Encadrement…). */
  famille: texteOptionnel(80),
  categorie: z.enum(CATEGORIES_PROFESSIONNELLES).nullable(),
  niveau: texteOptionnel(20),
  coefficient: texteOptionnel(20),
  description: texteOptionnel(2000),
  actif: z.boolean(),
});
export type PosteInput = z.infer<typeof posteSchema>;
