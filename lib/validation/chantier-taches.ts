import { z } from 'zod';

/**
 * Schemas Zod pour les tâches de chantier (M4.2).
 */

const trimmedOptionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

export const STATUTS_TACHE = ['a_faire', 'en_cours', 'bloque', 'termine', 'annule'] as const;
export type StatutTache = (typeof STATUTS_TACHE)[number];

export const LIBELLES_STATUT_TACHE: Record<StatutTache, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  bloque: 'Bloqué',
  termine: 'Terminé',
  annule: 'Annulé',
};

export const TRANSITIONS_TACHE: Record<StatutTache, StatutTache[]> = {
  a_faire: ['en_cours', 'annule'],
  en_cours: ['bloque', 'termine', 'annule'],
  bloque: ['en_cours', 'annule'],
  termine: ['en_cours'],
  annule: [],
};

export const chantierTacheSchema = z
  .object({
    libelle: z.string().trim().min(2, 'Libellé requis (2 caractères min).').max(200),
    description: trimmedOptionalString(2000),
    responsableId: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => (v && v.length > 0 ? v : null)),
    statut: z.enum(STATUTS_TACHE).default('a_faire'),
    avancementPourcent: z
      .union([z.string(), z.number()])
      .optional()
      .nullable()
      .transform((v, ctx) => {
        if (v === null || v === undefined || v === '') return 0;
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isNaN(n) || !Number.isFinite(n)) {
          ctx.addIssue({ code: 'custom', message: 'Avancement invalide.' });
          return z.NEVER;
        }
        const rounded = Math.round(n);
        if (rounded < 0 || rounded > 100) {
          ctx.addIssue({
            code: 'custom',
            message: 'Avancement entre 0 et 100.',
          });
          return z.NEVER;
        }
        return rounded;
      })
      .default(0),
    dateDebutPrevue: optionalDate,
    dateFinPrevue: optionalDate,
    dateDebutReelle: optionalDate,
    dateFinReelle: optionalDate,
    notes: trimmedOptionalString(2000),
  })
  .superRefine((val, ctx) => {
    if (val.dateDebutPrevue && val.dateFinPrevue && val.dateFinPrevue < val.dateDebutPrevue) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFinPrevue'],
        message: 'Date de fin prévue antérieure à la date de début.',
      });
    }
    if (val.dateDebutReelle && val.dateFinReelle && val.dateFinReelle < val.dateDebutReelle) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFinReelle'],
        message: 'Date de fin réelle antérieure à la date de début.',
      });
    }
  });

export type ChantierTacheInput = z.infer<typeof chantierTacheSchema>;

export const reordonnerTachesSchema = z.object({
  chantierId: z.uuid(),
  ids: z.array(z.uuid()).min(1),
});
export type ReordonnerTachesInput = z.infer<typeof reordonnerTachesSchema>;
