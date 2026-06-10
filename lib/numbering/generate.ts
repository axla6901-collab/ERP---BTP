import 'server-only';

import { sql } from 'drizzle-orm';

import type { TenantTx } from '@/lib/db/with-tenant';

/**
 * Types de documents supportés par la fonction Postgres `generate_numero`.
 * Doit rester en miroir du CASE dans db/migrations/0046_numerotation_modeles.sql
 * (qui ajoute templates configurables + types 'avoir' et 'chantier').
 */
export const TYPES_NUMERO = [
  'devis',
  'facture',
  'avoir',
  'commande',
  'contrat_st',
  'facture_st',
  'chantier',
] as const;

export type TypeNumero = (typeof TYPES_NUMERO)[number];

/**
 * Génère un nouveau numéro applicatif au format `<PRÉFIXE>-<ANNÉE>-<SEQ 6 chiffres>`.
 *
 * - Per-entreprise : chaque tenant a sa propre séquence (cf. 0043).
 * - Atomique (utilise `nextval` Postgres).
 * - Append-only : chaque appel insère une ligne dans `numeros_attribues` (audit fiscal FR).
 * - Reset annuel automatique (nouvelle séquence créée au 1er janvier).
 *
 * @param tx Transaction Drizzle obtenue via `withTenant(entrepriseId, tx => ...)`.
 *           L'appel doit se faire DANS la même transaction que l'INSERT métier
 *           (cohérence transactionnelle de l'attribution + de la création du document).
 * @param type Type de document (devis/facture/...).
 * @param entrepriseId Entreprise propriétaire du numéro (sera aussi vérifié par RLS).
 *
 * @example
 *   await withTenant(ctx.entreprise.id, async (tx) => {
 *     const numero = await generateNumero(tx, 'devis', ctx.entreprise.id);
 *     await tx.insert(devis).values({ ..., numero, entrepriseId: ctx.entreprise.id });
 *   });
 */
export async function generateNumero(
  tx: TenantTx,
  type: TypeNumero,
  entrepriseId: string,
): Promise<string> {
  const rows = (await tx.execute(
    sql`SELECT generate_numero(${type}, ${entrepriseId}::uuid) AS numero`,
  )) as unknown as Array<{ numero: string }>;
  const numero = rows[0]?.numero;
  if (!numero) {
    throw new Error(`generate_numero('${type}', '${entrepriseId}') a renvoyé une valeur vide`);
  }
  return numero;
}
