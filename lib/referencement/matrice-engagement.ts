'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import {
  natureTiersTypesEngagement,
  type NatureTiersTypeEngagement,
} from '@/db/schema/referentiel-tiers';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { ROLES_REFERENTIEL_TIERS_WRITE } from '@/lib/referencement/permissions';
import {
  matriceEngagementBatchSchema,
  type MatriceEngagementBatchInput,
} from '@/lib/validation/referencement-tiers';

/**
 * Matrice nature_tiers × type_engagement (Table 1 du docx). Table GLOBALE
 * (sans RLS), partagée entre toutes les entreprises et seedée par 0030.
 * La modifier impacte TOUS les tenants — réservé aux administrateurs.
 */

export async function lireMatriceEngagement(): Promise<NatureTiersTypeEngagement[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx.select().from(natureTiersTypesEngagement),
  );
}

export async function enregistrerMatriceEngagement(
  input: MatriceEngagementBatchInput,
): Promise<ActionResult<{ applied: number }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = matriceEngagementBatchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  if (parsed.data.length === 0) return { ok: true, data: { applied: 0 } };

  await withTenant(ctx.entreprise.id, async (tx) => {
    for (const cell of parsed.data) {
      await tx
        .update(natureTiersTypesEngagement)
        .set({ autorise: cell.autorise, updatedBy: ctx.utilisateur.id })
        .where(
          and(
            eq(natureTiersTypesEngagement.natureTiers, cell.natureTiers),
            eq(natureTiersTypesEngagement.typeEngagement, cell.typeEngagement),
          ),
        );
    }
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'nature_tiers_types_engagement',
      rowId: 'matrice-globale',
      after: { cellules: parsed.data },
    });
  });
  revalidatePath(`/${ctx.entreprise.slug}/administration/referentiel-tiers/types-engagement`);
  return { ok: true, data: { applied: parsed.data.length } };
}
