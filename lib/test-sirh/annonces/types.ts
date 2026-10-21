/**
 * Types sérialisables — Test SIRH › Annonces (communication interne).
 * Module neutre partagé entre les lectures serveur et les composants.
 */

import type { CategorieAnnonce } from '@/lib/validation/test-sirh/enums';

/** Annonce prête à l'affichage (fil d'actualité, gestion). Dates ISO. */
export type AnnonceAffichee = {
  id: string;
  titre: string;
  /** Texte brut (retours à la ligne conservés, aucun HTML). */
  contenu: string;
  categorie: CategorieAnnonce;
  epinglee: boolean;
  publiee: boolean;
  datePublication: string;
  dateExpiration: string | null;
  /** Audience (null = toute l'entreprise). */
  siteId: string | null;
  siteNom: string | null;
  equipeId: string | null;
  equipeNom: string | null;
  /** Email de l'auteur. */
  auteur: string | null;
  createdAt: string;
};
