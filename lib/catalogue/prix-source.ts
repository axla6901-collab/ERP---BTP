/**
 * Sources possibles du prix courant retenu par `prix_courant_article` (cf.
 * migration 0016) ou par `bom_cost_roll` :
 *   - `grille_prefere`   : grille active du fournisseur préféré
 *   - `prefere`          : prix_articles du fournisseur préféré
 *   - `reference`        : prix_articles de référence (sans fournisseur)
 *   - `grille_mini`      : grille active la moins chère (tous fournisseurs)
 *   - `mini_fournisseur` : prix_articles le moins cher (tous fournisseurs)
 *   - `calcule`          : prix de revient calculé depuis la composition (articles composés)
 *
 * Ce module n'est PAS `'use server'` car il exporte des constantes (libellés),
 * qui sont interdites dans un module Server Action.
 */
export type PrixSource =
  | 'grille_prefere'
  | 'prefere'
  | 'reference'
  | 'grille_mini'
  | 'mini_fournisseur'
  | 'calcule';

export const LIBELLES_PRIX_SOURCE: Record<PrixSource, string> = {
  grille_prefere: 'Grille fournisseur préféré',
  prefere: 'Prix fournisseur préféré',
  reference: 'Prix de référence',
  grille_mini: 'Grille moins-disante',
  mini_fournisseur: 'Prix fournisseur moins-disant',
  calcule: 'Calculé',
};
