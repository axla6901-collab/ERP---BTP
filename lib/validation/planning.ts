import { z } from 'zod';

/**
 * Schémas de validation pour le module Planning (Gantt).
 * Cf. db/migrations/0053_planning_module.sql pour les contraintes DB.
 */

const dateISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ');

/**
 * Bascule du feature flag `entreprises.planning_active`.
 */
export const planningFlagSchema = z.object({
  actif: z.boolean(),
});
export type PlanningFlagInput = z.infer<typeof planningFlagSchema>;

/**
 * Sauvegarde d'une tâche depuis le drawer du planning.
 * Couvre les champs visibles dans la maquette : intitulé, niveau, corps de
 * métier, dates, avancement, jalon, prédécesseur, notes.
 * `id` est obligatoire (la création depuis le planning arrive en phase B).
 */
export const planningTacheSchema = z
  .object({
    id: z.string().uuid(),
    libelle: z.string().trim().min(1, 'Intitulé requis').max(200),
    niveau: z.string().trim().max(40).nullable().optional(),
    corpsMetier: z.string().trim().max(40).nullable().optional(),
    dateDebutPrevue: dateISO.nullable().optional(),
    dateFinPrevue: dateISO.nullable().optional(),
    avancementPourcent: z.coerce.number().int().min(0).max(100),
    heuresPlanifiees: z.coerce.number().int().min(0).optional(),
    estJalon: z.boolean(),
    predecesseurId: z.string().uuid().nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
  })
  .refine((v) => !v.dateDebutPrevue || !v.dateFinPrevue || v.dateFinPrevue >= v.dateDebutPrevue, {
    message: 'La date de fin doit être postérieure à la date de début.',
    path: ['dateFinPrevue'],
  })
  .refine(
    (v) =>
      !v.estJalon ||
      !v.dateDebutPrevue ||
      !v.dateFinPrevue ||
      v.dateDebutPrevue === v.dateFinPrevue,
    {
      message: 'Un jalon a forcément une date de début = date de fin.',
      path: ['dateFinPrevue'],
    },
  );
export type PlanningTacheInput = z.infer<typeof planningTacheSchema>;

/**
 * Affectation d'un ouvrier à une tâche (ou mise à jour de ses heures).
 */
export const planningEquipeAjoutSchema = z.object({
  tacheId: z.string().uuid(),
  utilisateurId: z.string().min(1),
  heuresPrevues: z.coerce.number().int().min(0).default(0),
});
export type PlanningEquipeAjoutInput = z.infer<typeof planningEquipeAjoutSchema>;

export const planningEquipeMajSchema = z.object({
  id: z.string().uuid(),
  heuresPrevues: z.coerce.number().int().min(0),
  heuresFaites: z.coerce.number().int().min(0),
});
export type PlanningEquipeMajInput = z.infer<typeof planningEquipeMajSchema>;

/**
 * Création d'une tâche depuis le Gantt (bouton « + Tâche » ou drop bibliothèque BTP).
 * Tous les champs sauf `chantierId` ont un défaut, pour autoriser une création
 * « blanche » avec retouche immédiate via le drawer.
 */
export const planningCreationSchema = z
  .object({
    chantierId: z.string().uuid(),
    libelle: z.string().trim().min(1).max(200).default('Nouvelle tâche'),
    niveau: z.string().trim().max(40).nullable().optional(),
    corpsMetier: z.string().trim().max(40).nullable().optional(),
    dateDebutPrevue: dateISO.nullable().optional(),
    dateFinPrevue: dateISO.nullable().optional(),
    heuresPlanifiees: z.coerce.number().int().min(0).default(0),
    estJalon: z.boolean().default(false),
  })
  .refine((v) => !v.dateDebutPrevue || !v.dateFinPrevue || v.dateFinPrevue >= v.dateDebutPrevue, {
    message: 'La date de fin doit être postérieure à la date de début.',
    path: ['dateFinPrevue'],
  });
export type PlanningCreationInput = z.infer<typeof planningCreationSchema>;

/**
 * Application en lot des décalages de dates après une cascade (drag-move sur
 * un prédécesseur). Le client envoie la liste des changements calculée par
 * `cascadeDelta` ; le serveur valide chaque ligne et applique en transaction.
 *
 * Garde-fou `max(500)` : empêche un payload aberrant.
 */
export const planningCascadeSchema = z.object({
  changes: z
    .array(
      z
        .object({
          id: z.string().uuid(),
          dateDebutPrevue: dateISO,
          dateFinPrevue: dateISO,
        })
        .refine((v) => v.dateFinPrevue >= v.dateDebutPrevue, {
          message: 'Cascade : fin antérieure au début.',
          path: ['dateFinPrevue'],
        }),
    )
    .max(500, 'Trop de changements dans la cascade.'),
});
export type PlanningCascadeInput = z.infer<typeof planningCascadeSchema>;

/**
 * Duplication d'un étage / niveau : clone toutes les tâches du niveau source dans
 * le même chantier, décalées après la fin du groupe d'origine. Les liens
 * `predecesseur_id` internes au groupe sont préservés ; les liens hors-groupe
 * sont coupés (pas de duplication cross-groupe).
 */
export const planningDuplicationSchema = z.object({
  chantierId: z.string().uuid(),
  niveau: z.string().trim().min(1, 'Niveau requis').max(40),
});
export type PlanningDuplicationInput = z.infer<typeof planningDuplicationSchema>;
