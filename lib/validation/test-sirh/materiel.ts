import { z } from 'zod';

import {
  dateOptionnelle,
  dateRequise,
  montantOptionnel,
  texteOptionnel,
  texteRequis,
  uuidRequis,
} from './commun';
import { CATEGORIES_MATERIEL, STATUTS_MATERIEL } from './enums';

/**
 * Schémas Zod — Test SIRH › Matériel & EPI (Factorial it_management, étendu
 * aux EPI, outillage, badges et vêtements de travail).
 */

export const materielSchema = z
  .object({
    id: z.string().uuid().optional(),
    categorie: z.enum(CATEGORIES_MATERIEL),
    libelle: texteRequis('Libellé', 200),
    marque: texteOptionnel(100),
    modele: texteOptionnel(100),
    /** Unique par entreprise (index partiel `uq_sirh_materiels_serie_actif`). */
    numeroSerie: texteOptionnel(100),
    /** Taille (EPI, vêtements de travail). */
    taille: texteOptionnel(20),
    dateAchat: dateOptionnelle,
    valeurAchat: montantOptionnel("Valeur d'achat"),
    dateFinGarantie: dateOptionnelle,
    /** Prochain contrôle périodique / date de péremption. */
    dateControle: dateOptionnelle,
    statut: z.enum(STATUTS_MATERIEL),
    notes: texteOptionnel(1000),
  })
  .superRefine((v, ctx) => {
    if (v.dateAchat && v.dateFinGarantie && v.dateFinGarantie < v.dateAchat) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFinGarantie'],
        message: "La fin de garantie doit être postérieure à la date d'achat.",
      });
    }
  });
export type MaterielInput = z.infer<typeof materielSchema>;

/** Remise d'un matériel à un collaborateur (une seule attribution en cours par matériel). */
export const attributionMaterielSchema = z.object({
  materielId: uuidRequis('Matériel'),
  employeId: uuidRequis('Collaborateur'),
  dateRemise: dateRequise,
  etatRemise: texteOptionnel(200),
  /** Décharge de remise signée par le salarié. */
  dechargeSignee: z.boolean(),
  commentaire: texteOptionnel(1000),
});
export type AttributionMaterielInput = z.infer<typeof attributionMaterielSchema>;

/** Retour du matériel (clôt l'attribution en cours). */
export const restitutionMaterielSchema = z.object({
  materielId: uuidRequis('Matériel'),
  dateRetour: dateRequise,
  etatRetour: texteOptionnel(200),
  /** Défaut constaté au retour → statut « en réparation » au lieu de « en stock ». */
  signalerReparation: z.boolean(),
  commentaire: texteOptionnel(1000),
});
export type RestitutionMaterielInput = z.infer<typeof restitutionMaterielSchema>;
