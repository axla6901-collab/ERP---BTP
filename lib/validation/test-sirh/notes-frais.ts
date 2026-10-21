import { z } from 'zod';

import {
  dateRequise,
  decimalOptionnel,
  entierOptionnel,
  texteRequis,
  uuidOptionnel,
  uuidRequis,
} from './commun';
import { CATEGORIES_FRAIS, NATURES_FRAIS } from './enums';

/**
 * Schémas Zod — Test SIRH › Notes de frais (Factorial expenses : Expense /
 * Mileage / PerDiem). Une note porte UNE nature :
 * - `depense`      : montant TTC (+ TVA) sur justificatif ;
 * - `indemnite_km` : distance × taux (barème kilométrique, modifiable) ;
 * - `forfait`      : nombre × montant unitaire (panier, grand déplacement…).
 *
 * Les montants d'IK et de forfait sont RECALCULÉS côté serveur
 * (`normaliserMontantsNoteFrais`) : seules les données sources font foi.
 */

/** Plafond de cohérence d'un montant de note (colonnes numeric(12,2) / (10,2)). */
const MONTANT_MAX = 999_999.99;

export const noteFraisSchema = z
  .object({
    id: z.string().uuid().optional(),
    employeId: uuidRequis('Collaborateur'),
    dateDepense: dateRequise,
    nature: z.enum(NATURES_FRAIS),
    categorie: z.enum(CATEGORIES_FRAIS),
    libelle: texteRequis('Libellé', 200),
    // Dépense sur justificatif
    montantTtc: decimalOptionnel('Montant TTC', { min: 0, max: MONTANT_MAX }),
    montantTva: decimalOptionnel('TVA', { min: 0, max: MONTANT_MAX }),
    // Indemnités kilométriques
    distanceKm: decimalOptionnel('Distance', {
      decimales: 1,
      strictementPositif: true,
      max: 99_999.9,
    }),
    puissanceFiscale: entierOptionnel('Puissance fiscale', { min: 1, max: 50 }),
    /** Saisie uniquement (non stocké) : sert au calcul du taux du barème (+ 20 %). */
    vehiculeElectrique: z.boolean(),
    tauxKm: decimalOptionnel('Taux kilométrique', {
      decimales: 3,
      strictementPositif: true,
      max: 10,
    }),
    // Forfaits
    nbForfaits: decimalOptionnel('Nombre de forfaits', {
      decimales: 1,
      strictementPositif: true,
      max: 999.9,
    }),
    montantUnitaire: decimalOptionnel('Montant unitaire', { min: 0, max: 99_999.99 }),
    // Imputation et pièce
    chantierId: uuidOptionnel,
    justificatifDocumentId: uuidOptionnel,
  })
  .superRefine((v, ctx) => {
    const requis = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (v.nature === 'depense') {
      if (v.montantTtc === null || Number(v.montantTtc) <= 0) {
        requis('montantTtc', 'Montant TTC requis (strictement positif).');
      } else if (v.montantTva !== null && Number(v.montantTva) > Number(v.montantTtc)) {
        requis('montantTva', 'La TVA ne peut pas dépasser le montant TTC.');
      }
    }
    if (v.nature === 'indemnite_km') {
      if (v.distanceKm === null) requis('distanceKm', 'Distance requise.');
      if (v.puissanceFiscale === null) requis('puissanceFiscale', 'Puissance fiscale requise.');
    }
    if (v.nature === 'forfait') {
      if (v.nbForfaits === null) requis('nbForfaits', 'Nombre de forfaits requis.');
      if (v.montantUnitaire === null || Number(v.montantUnitaire) <= 0) {
        requis('montantUnitaire', 'Montant unitaire requis (strictement positif).');
      }
    }
  });
export type NoteFraisInput = z.infer<typeof noteFraisSchema>;

/** « Marquer remboursée » : date du virement / de la paie qui a remboursé la note. */
export const remboursementNoteFraisSchema = z.object({
  id: uuidRequis('Note de frais'),
  dateRemboursement: dateRequise,
});
export type RemboursementNoteFraisInput = z.infer<typeof remboursementNoteFraisSchema>;
