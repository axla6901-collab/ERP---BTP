import { z } from 'zod';

import { dateOptionnelle, dateRequise, texteRequis, uuidOptionnel, uuidRequis } from './commun';
import { CATEGORIES_ANNONCE } from './enums';

/**
 * Schémas Zod — Test SIRH › Annonces (communication interne, Factorial posts).
 *
 * Le contenu est du TEXTE BRUT (retours à la ligne conservés à l'affichage,
 * aucun HTML interprété). Audience : `siteId` / `equipeId` nuls = toute
 * l'entreprise ; renseignés, les critères se cumulent.
 */

export const annonceSchema = z
  .object({
    id: z.string().uuid().optional(),
    titre: texteRequis('Titre', 200),
    contenu: texteRequis('Contenu', 10_000),
    categorie: z.enum(CATEGORIES_ANNONCE),
    epinglee: z.boolean(),
    publiee: z.boolean(),
    datePublication: dateRequise,
    dateExpiration: dateOptionnelle,
    siteId: uuidOptionnel,
    equipeId: uuidOptionnel,
  })
  .superRefine((v, ctx) => {
    // Miroir du CHECK `chk_sirh_annonces_dates`.
    if (v.dateExpiration && v.dateExpiration < v.datePublication) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateExpiration'],
        message: 'La date d’expiration doit être postérieure ou égale à la date de publication.',
      });
    }
  });
export type AnnonceInput = z.infer<typeof annonceSchema>;

/** Épingler / désépingler une annonce. */
export const epingleAnnonceSchema = z.object({
  id: uuidRequis('Annonce'),
  epinglee: z.boolean(),
});
export type EpingleAnnonceInput = z.infer<typeof epingleAnnonceSchema>;
