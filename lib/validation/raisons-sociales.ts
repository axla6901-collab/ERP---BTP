import { z } from 'zod';

/**
 * Schéma Zod du référentiel central des raisons sociales (écran CRUD sous
 * Administration). La saisie inline (depuis un client/fournisseur/sous-traitant/
 * société) ne passe pas par ce schéma : elle réutilise le champ texte existant
 * du formulaire, résolu côté serveur via `getOrCreateRaisonSocialeId`.
 */
export const raisonSocialeSchema = z.object({
  raisonSociale: z
    .string()
    .trim()
    .min(2, 'Raison sociale trop courte (min 2 caractères).')
    .max(200, 'Raison sociale trop longue (max 200 caractères).'),
  actif: z.boolean().default(true),
});

export type RaisonSocialeInput = z.infer<typeof raisonSocialeSchema>;
