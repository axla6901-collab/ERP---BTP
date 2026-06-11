'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import {
  corpsEtatDocumentsRequis,
  type CorpsEtatDocumentRequis,
} from '@/db/schema/referentiel-tiers';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { ROLES_REFERENTIEL_TIERS_WRITE } from '@/lib/referencement/permissions';
import {
  correspondanceBatchSchema,
  type CorrespondanceBatchInput,
} from '@/lib/validation/referencement-tiers';

function pathBase(slug: string) {
  return `/${slug}/administration/referentiel-tiers/correspondance`;
}

export async function lireCorrespondance(corpsEtatId: string): Promise<CorpsEtatDocumentRequis[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(corpsEtatDocumentsRequis)
      .where(eq(corpsEtatDocumentsRequis.corpsEtatId, corpsEtatId)),
  );
}

/**
 * Remplace l'intégralité des documents requis d'un corps d'état par la liste
 * fournie (delete-all puis insert). Plus simple et sûr qu'un diff incrémental
 * pour une table de paramétrage à faible cardinalité.
 */
export async function enregistrerCorrespondance(
  input: CorrespondanceBatchInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = correspondanceBatchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { corpsEtatId, lignes } = parsed.data;
  // Dédoublonnage défensif sur la PK (corps_etat_id, nature_document_id, nature_tiers).
  const uniques = new Map<string, (typeof lignes)[number]>();
  for (const l of lignes) uniques.set(`${l.natureDocumentId}|${l.natureTiers}`, l);

  await withTenant(ctx.entreprise.id, async (tx) => {
    await tx
      .delete(corpsEtatDocumentsRequis)
      .where(eq(corpsEtatDocumentsRequis.corpsEtatId, corpsEtatId));
    if (uniques.size > 0) {
      await tx.insert(corpsEtatDocumentsRequis).values(
        [...uniques.values()].map((l) => ({
          entrepriseId: ctx.entreprise.id,
          corpsEtatId,
          natureDocumentId: l.natureDocumentId,
          natureTiers: l.natureTiers,
          estBloquant: l.estBloquant,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })),
      );
    }
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'corps_etat_documents_requis',
      rowId: corpsEtatId,
      after: { corpsEtatId, lignes: [...uniques.values()] },
    });
  });
  revalidatePath(pathBase(ctx.entreprise.slug));
  return { ok: true, data: undefined };
}
