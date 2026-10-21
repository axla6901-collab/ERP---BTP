import { z } from 'zod';

import { estDateIso, jourSemaine, minutesDepuisMinuit } from '@/lib/test-sirh/calendrier';

import {
  dateRequise,
  decimalRequis,
  entierRequis,
  heureOptionnelle,
  heureRequise,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
  uuidRequis,
} from './commun';
import { COMPENSATIONS_HS, LIEUX_TRAVAIL, MAJORATIONS_HS } from './enums';

/**
 * Schémas Zod — Test SIRH › Temps de travail (horaires, badgeages, heures sup.).
 * Factorial : work_schedule/Schedule, attendance/Shift, attendance/OvertimeRequest.
 */

const dateCalendaire = dateRequise.refine((v) => estDateIso(v), 'Date invalide.');

// ─────────────────────────────────────────────────────────────
// Horaires de travail
// ─────────────────────────────────────────────────────────────

const heuresJour = (jour: string) => decimalRequis(`Heures du ${jour}`, { min: 0, max: 24 });

/** Clés des 7 colonnes `heures_<jour>` dans l'ordre lundi → dimanche. */
export const CLES_HEURES_JOURS = [
  'heuresLundi',
  'heuresMardi',
  'heuresMercredi',
  'heuresJeudi',
  'heuresVendredi',
  'heuresSamedi',
  'heuresDimanche',
] as const;
export type CleHeuresJour = (typeof CLES_HEURES_JOURS)[number];

export const LIBELLES_JOURS_HORAIRE: Record<CleHeuresJour, string> = {
  heuresLundi: 'Lundi',
  heuresMardi: 'Mardi',
  heuresMercredi: 'Mercredi',
  heuresJeudi: 'Jeudi',
  heuresVendredi: 'Vendredi',
  heuresSamedi: 'Samedi',
  heuresDimanche: 'Dimanche',
};

export const horaireSchema = z
  .object({
    id: z.string().uuid().optional(),
    nom: texteRequis('Nom', 120),
    description: texteOptionnel(500),
    heuresLundi: heuresJour('lundi'),
    heuresMardi: heuresJour('mardi'),
    heuresMercredi: heuresJour('mercredi'),
    heuresJeudi: heuresJour('jeudi'),
    heuresVendredi: heuresJour('vendredi'),
    heuresSamedi: heuresJour('samedi'),
    heuresDimanche: heuresJour('dimanche'),
    parDefaut: z.boolean(),
    actif: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.parDefaut && !v.actif) {
      ctx.addIssue({
        code: 'custom',
        path: ['actif'],
        message: 'Un horaire par défaut doit rester actif.',
      });
    }
    const total = CLES_HEURES_JOURS.reduce((s, k) => s + (Number(v[k]) || 0), 0);
    if (total <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['heuresLundi'],
        message: 'Le total hebdomadaire doit être supérieur à 0 h.',
      });
    }
  });
export type HoraireInput = z.infer<typeof horaireSchema>;

// ─────────────────────────────────────────────────────────────
// Badgeages
// ─────────────────────────────────────────────────────────────

export const badgeageSchema = z
  .object({
    id: z.string().uuid().optional(),
    employeId: uuidRequis('Employé'),
    dateBadgeage: dateCalendaire,
    heureDebut: heureRequise,
    /** Vide = badgeage en cours. */
    heureFin: heureOptionnelle,
    pauseMinutes: entierRequis('Pause', { min: 0, max: 720 }),
    lieu: z.enum(LIEUX_TRAVAIL),
    chantierId: uuidOptionnel,
    commentaire: texteOptionnel(500),
  })
  .superRefine((v, ctx) => {
    if (!v.heureFin) return;
    const debut = minutesDepuisMinuit(v.heureDebut);
    const fin = minutesDepuisMinuit(v.heureFin);
    if (debut === null || fin === null) return;
    if (debut === fin) {
      ctx.addIssue({
        code: 'custom',
        path: ['heureFin'],
        message: 'L’heure de fin doit différer de l’heure de début.',
      });
      return;
    }
    const amplitude = fin > debut ? fin - debut : fin + 24 * 60 - debut;
    if (v.pauseMinutes >= amplitude) {
      ctx.addIssue({
        code: 'custom',
        path: ['pauseMinutes'],
        message: 'La pause doit être inférieure à la durée du badgeage.',
      });
    }
  });
export type BadgeageInput = z.infer<typeof badgeageSchema>;

/** « Valider la semaine » d'un collaborateur. */
export const validationSemaineSchema = z.object({
  employeId: uuidRequis('Employé'),
  lundi: dateRequise.refine(
    (v) => estDateIso(v) && jourSemaine(v) === 1,
    'La semaine doit commencer un lundi.',
  ),
});
export type ValidationSemaineInput = z.infer<typeof validationSemaineSchema>;

// ─────────────────────────────────────────────────────────────
// Heures supplémentaires
// ─────────────────────────────────────────────────────────────

export const heuresSupSchema = z.object({
  employeId: uuidRequis('Employé'),
  dateHeures: dateCalendaire,
  dureeHeures: decimalRequis('Durée', { strictementPositif: true, max: 24 }),
  majorationPct: z
    .number({ error: 'Majoration requise.' })
    .int('Majoration invalide.')
    .refine((v) => (MAJORATIONS_HS as readonly number[]).includes(v), 'Majoration invalide.'),
  compensation: z.enum(COMPENSATIONS_HS),
  chantierId: uuidOptionnel,
  motif: texteOptionnel(500),
});
export type HeuresSupInput = z.infer<typeof heuresSupSchema>;
