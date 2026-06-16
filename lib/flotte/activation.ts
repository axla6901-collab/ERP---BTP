'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { peutAdministrer } from '@/lib/admin/permissions';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { entreprises } from '@/db/schema/entreprises';
import { flotteFlagSchema, type FlotteFlagInput } from '@/lib/validation/flotte';

/**
 * Bascule l'option « Flotte automobile » pour l'entreprise courante (module
 * complémentaire, même patron que `setPlanningActive` / `setTiersReferencementActive`).
 *
 * Revalide la sidebar (`layout`) pour faire apparaître / disparaître l'entrée de
 * menu immédiatement. Pas de seed nécessaire à l'activation.
 */
export async function setFlotteAutomobileActive(
  input: FlotteFlagInput,
): Promise<ActionResult<{ flotteAutomobileActive: boolean }>> {
  const parsed = flotteFlagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutAdministrer(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé : rôle administrateur requis.' };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select({ flotteAutomobileActive: entreprises.flotteAutomobileActive })
      .from(entreprises)
      .where(eq(entreprises.id, ctx.entreprise.id));
    await tx
      .update(entreprises)
      .set({ flotteAutomobileActive: parsed.data.actif, updatedAt: new Date() })
      .where(eq(entreprises.id, ctx.entreprise.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'entreprises',
      rowId: ctx.entreprise.id,
      before,
      after: { flotteAutomobileActive: parsed.data.actif },
    });
  });

  revalidatePath(`/${ctx.entreprise.slug}`, 'layout');
  return { ok: true, data: { flotteAutomobileActive: parsed.data.actif } };
}
