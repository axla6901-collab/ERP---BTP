'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { peutAdministrer } from '@/lib/admin/permissions';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { entreprises } from '@/db/schema/entreprises';
import {
  tiersReferencementFlagSchema,
  type TiersReferencementFlagInput,
} from '@/lib/validation/referencement-tiers';

import { seederReferentielTiers } from './seed-referentiel';

/**
 * Bascule l'option « Référencement & Agrément des tiers » pour l'entreprise
 * courante (module complémentaire, même patron que `setPlanningActive`).
 *
 * À l'activation, seede le référentiel documentaire par défaut si l'entreprise
 * n'en a pas encore (idempotent). Revalide la sidebar pour faire apparaître /
 * disparaître l'entrée de menu immédiatement.
 */
export async function setTiersReferencementActive(
  input: TiersReferencementFlagInput,
): Promise<ActionResult<{ tiersReferencementActive: boolean }>> {
  const parsed = tiersReferencementFlagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutAdministrer(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé : rôle administrateur requis.' };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select({ tiersReferencementActive: entreprises.tiersReferencementActive })
      .from(entreprises)
      .where(eq(entreprises.id, ctx.entreprise.id));
    await tx
      .update(entreprises)
      .set({ tiersReferencementActive: parsed.data.actif, updatedAt: new Date() })
      .where(eq(entreprises.id, ctx.entreprise.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'entreprises',
      rowId: ctx.entreprise.id,
      before,
      after: { tiersReferencementActive: parsed.data.actif },
    });

    // Premier allumage : pose le référentiel documentaire par défaut.
    if (parsed.data.actif) {
      await seederReferentielTiers(tx, ctx.entreprise.id, ctx.utilisateur.id);
    }
  });

  revalidatePath(`/${ctx.entreprise.slug}`, 'layout');
  return { ok: true, data: { tiersReferencementActive: parsed.data.actif } };
}
