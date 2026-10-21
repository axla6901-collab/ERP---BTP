import { z } from 'zod';

import { decimalOptionnel, entierRequis, texteOptionnel, texteRequis, uuidRequis } from './commun';
import { STATUTS_PERIODE_PAIE, TYPES_VARIABLE_PAIE } from './enums';

/**
 * Schémas Zod — Test SIRH › Paie (périodes, variables).
 * Factorial : payroll/PolicyPeriod, payroll/Supplement, compensations/PayrollRun.
 */

// ─────────────────────────────────────────────────────────────
// Périodes
// ─────────────────────────────────────────────────────────────

export const periodePaieSchema = z.object({
  annee: entierRequis('Année', { min: 2000, max: 2100 }),
  mois: entierRequis('Mois', { min: 1, max: 12 }),
  notes: texteOptionnel(1000),
});
export type PeriodePaieInput = z.infer<typeof periodePaieSchema>;

export const statutPeriodeSchema = z.object({
  id: uuidRequis('Période'),
  statut: z.enum(STATUTS_PERIODE_PAIE),
});
export type StatutPeriodeInput = z.infer<typeof statutPeriodeSchema>;

// ─────────────────────────────────────────────────────────────
// Variables de paie
// ─────────────────────────────────────────────────────────────

/** Bornes des colonnes `numeric(10,2)` (quantité) et `numeric(12,2)` (montant). */
const MAX_QUANTITE = 99_999_999.99;
const MAX_MONTANT = 9_999_999_999.99;

export const variablePaieSchema = z
  .object({
    id: z.string().uuid().optional(),
    periodeId: uuidRequis('Période'),
    employeId: uuidRequis('Employé'),
    typeVariable: z.enum(TYPES_VARIABLE_PAIE),
    libelle: texteRequis('Libellé', 200),
    codeRubrique: texteOptionnel(30),
    quantite: decimalOptionnel('Quantité', { min: -MAX_QUANTITE, max: MAX_QUANTITE }),
    montant: decimalOptionnel('Montant', { min: -MAX_MONTANT, max: MAX_MONTANT }),
    commentaire: texteOptionnel(500),
  })
  .superRefine((v, ctx) => {
    if (v.quantite === null && v.montant === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantite'],
        message: 'Renseignez une quantité ou un montant.',
      });
    }
  });
export type VariablePaieInput = z.infer<typeof variablePaieSchema>;
