import { z } from 'zod';

import {
  dateOptionnelle,
  dateRequise,
  decimalOptionnel,
  emailOptionnel,
  entierOptionnel,
  montantOptionnel,
  texteOptionnel,
  uuidOptionnel,
  uuidRequis,
} from './commun';
import {
  CATEGORIES_PROFESSIONNELLES,
  MOTIFS_FIN_CONTRAT,
  TEMPS_TRAVAIL,
  TYPES_CONTRAT,
  TYPES_CONTRAT_A_TERME,
  type TypeContratSirh,
} from './enums';

/**
 * Schémas Zod — Test SIRH › Collaborateurs (affectation, compte utilisateur,
 * contrats). Factorial : employees/Employee (extension), contracts/ContractVersion
 * + Compensation.
 */

/** Types de contrat dont le motif de recours est obligatoire (art. L1242-12 / L1251-43 C. trav.). */
export const TYPES_CONTRAT_MOTIF_RECOURS: readonly TypeContratSirh[] = ['cdd', 'interim'];

/** Durée légale hebdomadaire : en deçà, le contrat est à temps partiel (art. L3123-1). */
export const DUREE_LEGALE_HEBDO = 35;

// ─────────────────────────────────────────────────────────────
// Affectation (extension SIRH 1-1 de l'employé : sirh_collaborateurs)
// ─────────────────────────────────────────────────────────────

export const affectationSchema = z
  .object({
    employeId: uuidRequis('Collaborateur'),
    posteId: uuidOptionnel,
    siteId: uuidOptionnel,
    managerId: uuidOptionnel,
    horaireId: uuidOptionnel,
    /** Société employeuse (entité du groupe). */
    societeId: uuidOptionnel,
    emailProfessionnel: emailOptionnel,
    telephoneProfessionnel: texteOptionnel(30),
    dateAnciennete: dateOptionnelle,
    notes: texteOptionnel(2000),
  })
  .refine((v) => !v.managerId || v.managerId !== v.employeId, {
    message: 'Un collaborateur ne peut pas être son propre manager.',
    path: ['managerId'],
  });
export type AffectationInput = z.infer<typeof affectationSchema>;

// ─────────────────────────────────────────────────────────────
// Compte utilisateur rattaché (employes.utilisateur_id)
// ─────────────────────────────────────────────────────────────

export const compteUtilisateurSchema = z.object({
  employeId: uuidRequis('Collaborateur'),
  /** Identifiant better-auth (texte, pas un UUID). */
  utilisateurId: z
    .string({ error: 'Compte utilisateur requis.' })
    .trim()
    .min(1, 'Compte utilisateur requis.')
    .max(200, 'Identifiant de compte invalide.'),
});
export type CompteUtilisateurInput = z.infer<typeof compteUtilisateurSchema>;

// ─────────────────────────────────────────────────────────────
// Versions de contrat (sirh_contrats)
// ─────────────────────────────────────────────────────────────

export const contratSchema = z
  .object({
    id: z.string().uuid().optional(),
    employeId: uuidRequis('Collaborateur'),
    typeContrat: z.enum(TYPES_CONTRAT),
    motifRecours: texteOptionnel(500),
    dateDebut: dateRequise,
    dateFin: dateOptionnelle,
    dateFinPeriodeEssai: dateOptionnelle,
    motifFin: z.enum(MOTIFS_FIN_CONTRAT).nullable(),
    posteId: uuidOptionnel,
    /** Intitulé figé à la signature (le catalogue de postes peut évoluer). */
    intitulePoste: texteOptionnel(120),
    categorie: z.enum(CATEGORIES_PROFESSIONNELLES).nullable(),
    niveau: texteOptionnel(20),
    coefficient: texteOptionnel(20),
    tempsTravail: z.enum(TEMPS_TRAVAIL),
    heuresHebdo: decimalOptionnel('Heures hebdomadaires', { strictementPositif: true, max: 48 }),
    joursForfait: entierOptionnel('Jours du forfait', { min: 1, max: 235 }),
    conventionCollective: texteOptionnel(120),
    societeId: uuidOptionnel,
    siteId: uuidOptionnel,
    /** Rémunération (chiffrée en base) — prise en compte uniquement avec le droit PAIE. */
    salaireBrutMensuel: montantOptionnel('Salaire brut mensuel'),
    tauxHoraireBrut: montantOptionnel('Taux horaire brut'),
    notes: texteOptionnel(2000),
  })
  .superRefine((v, ctx) => {
    if (v.dateFin && v.dateFin < v.dateDebut) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFin'],
        message: 'La date de fin doit être postérieure ou égale à la date de début.',
      });
    }
    if (TYPES_CONTRAT_A_TERME.includes(v.typeContrat) && !v.dateFin) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFin'],
        message: 'Date de fin requise pour un contrat à terme (CDD, intérim, alternance, stage…).',
      });
    }
    if (TYPES_CONTRAT_MOTIF_RECOURS.includes(v.typeContrat) && !v.motifRecours) {
      ctx.addIssue({
        code: 'custom',
        path: ['motifRecours'],
        message: 'Motif de recours obligatoire pour un CDD ou une mission d’intérim.',
      });
    }
    if (v.dateFinPeriodeEssai) {
      if (v.dateFinPeriodeEssai < v.dateDebut) {
        ctx.addIssue({
          code: 'custom',
          path: ['dateFinPeriodeEssai'],
          message: 'La fin de période d’essai doit être postérieure au début du contrat.',
        });
      } else if (v.dateFin && v.dateFinPeriodeEssai > v.dateFin) {
        ctx.addIssue({
          code: 'custom',
          path: ['dateFinPeriodeEssai'],
          message: 'La fin de période d’essai ne peut pas dépasser la fin du contrat.',
        });
      }
    }
    if (v.motifFin && !v.dateFin) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFin'],
        message: 'Renseignez la date de fin du contrat (un motif de fin est indiqué).',
      });
    }
    if (v.tempsTravail === 'forfait_jours' && v.joursForfait === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['joursForfait'],
        message: 'Nombre de jours du forfait requis.',
      });
    }
    if (v.tempsTravail === 'temps_partiel') {
      if (v.heuresHebdo === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['heuresHebdo'],
          message: 'Durée hebdomadaire requise pour un temps partiel.',
        });
      } else if (Number(v.heuresHebdo) >= DUREE_LEGALE_HEBDO) {
        ctx.addIssue({
          code: 'custom',
          path: ['heuresHebdo'],
          message: `Un temps partiel est inférieur à ${DUREE_LEGALE_HEBDO} h hebdomadaires.`,
        });
      }
    }
  });
export type ContratInput = z.infer<typeof contratSchema>;

/** « Terminer le contrat » : date de fin + motif (CHECK `chk_sirh_contrats_motif_fin`). */
export const terminerContratSchema = z.object({
  id: uuidRequis('Contrat'),
  dateFin: dateRequise,
  motifFin: z.enum(MOTIFS_FIN_CONTRAT),
});
export type TerminerContratInput = z.infer<typeof terminerContratSchema>;
