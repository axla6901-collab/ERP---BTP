import 'server-only';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { raisonsSociales } from '@/db/schema/raisons-sociales';
import type { TenantTx } from '@/lib/db/with-tenant';

/**
 * Résout un nom de raison sociale (texte saisi) vers l'`id` de l'entrée
 * correspondante du référentiel central, en la créant si elle n'existe pas.
 *
 * À appeler DANS la transaction tenant (`withTenant`) de la server action qui
 * crée/met à jour un client (pro), un fournisseur, un sous-traitant ou une
 * société — pas exporté comme server action (reçoit un `tx`).
 *
 * Dédoublonnage insensible à la casse, scopé au tenant courant (RLS via le GUC
 * posé par `withTenant`). Réutilise une entrée active existante plutôt que d'en
 * créer un doublon.
 */
export async function getOrCreateRaisonSocialeId(
  tx: TenantTx,
  entrepriseId: string,
  raisonSociale: string,
  utilisateurId: string,
): Promise<string> {
  const nom = raisonSociale.trim();

  const [existing] = await tx
    .select({ id: raisonsSociales.id })
    .from(raisonsSociales)
    .where(
      and(
        eq(raisonsSociales.entrepriseId, entrepriseId),
        isNull(raisonsSociales.deletedAt),
        sql`lower(${raisonsSociales.raisonSociale}) = lower(${nom})`,
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  try {
    const [inserted] = await tx
      .insert(raisonsSociales)
      .values({
        entrepriseId,
        raisonSociale: nom,
        createdBy: utilisateurId,
        updatedBy: utilisateurId,
      })
      .returning({ id: raisonsSociales.id });
    if (!inserted) throw new Error('INSERT raison_sociale failed silently');
    return inserted.id;
  } catch (err) {
    // Course (deux créations concurrentes du même nom) : l'index unique
    // a tranché, on relit l'entrée gagnante.
    if (err instanceof Error && /unique/i.test(err.message)) {
      const [row] = await tx
        .select({ id: raisonsSociales.id })
        .from(raisonsSociales)
        .where(
          and(
            eq(raisonsSociales.entrepriseId, entrepriseId),
            isNull(raisonsSociales.deletedAt),
            sql`lower(${raisonsSociales.raisonSociale}) = lower(${nom})`,
          ),
        )
        .limit(1);
      if (row) return row.id;
    }
    throw err;
  }
}
