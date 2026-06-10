'use server';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { corpsEtat, type CorpsEtat } from '@/db/schema/referentiel-tiers';
import { tierCorpsEtat } from '@/db/schema/tiers-registre';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { ROLES_REFERENTIEL_TIERS_WRITE } from '@/lib/referencement/permissions';
import { corpsEtatSchema, type CorpsEtatInput } from '@/lib/validation/referencement-tiers';

function pathBase(slug: string) {
  return `/${slug}/administration/referentiel-tiers/corps-etat`;
}

export async function listerCorpsEtat(): Promise<CorpsEtat[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(corpsEtat)
      .where(isNull(corpsEtat.deletedAt))
      .orderBy(asc(corpsEtat.ordreAffichage), asc(corpsEtat.code)),
  );
}

export async function lireCorpsEtat(id: string): Promise<CorpsEtat | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(corpsEtat)
      .where(and(eq(corpsEtat.id, id), isNull(corpsEtat.deletedAt)))
      .limit(1);
    return row ?? null;
  });
}

export async function creerCorpsEtat(input: CorpsEtatInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = corpsEtatSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(corpsEtat)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          ordreAffichage: parsed.data.ordreAffichage,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: corpsEtat.id });
      if (!inserted) throw new Error('INSERT failed silently');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'corps_etat',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(pathBase(ctx.entreprise.slug));
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

export async function mettreAJourCorpsEtat(
  id: string,
  input: CorpsEtatInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = corpsEtatSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(corpsEtat)
        .where(and(eq(corpsEtat.id, id), isNull(corpsEtat.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(corpsEtat)
        .set({
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          ordreAffichage: parsed.data.ordreAffichage,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(corpsEtat.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'corps_etat',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(pathBase(ctx.entreprise.slug));
    revalidatePath(`${pathBase(ctx.entreprise.slug)}/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Corps d’état introuvable ou supprimé.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

export async function supprimerCorpsEtat(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(corpsEtat)
      .where(and(eq(corpsEtat.id, id), isNull(corpsEtat.deletedAt)))
      .limit(1);
    if (!before) return { ok: true, data: undefined };

    // Soft-delete ne déclenche pas les FK → on compte explicitement les tiers
    // qui référencent ce corps d'état (cf. règle générale de suppression).
    const [usage] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tierCorpsEtat)
      .where(eq(tierCorpsEtat.corpsEtatId, id));
    const message = messageBlocageSuppression('ce corps d’état', [
      { nombre: Number(usage?.n ?? 0), singulier: 'tier', pluriel: 'tiers' },
    ]);
    if (message) return { ok: false, error: message };

    await tx
      .update(corpsEtat)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(corpsEtat.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'corps_etat', rowId: id, before });
    revalidatePath(pathBase(ctx.entreprise.slug));
    return { ok: true, data: undefined };
  });
}
