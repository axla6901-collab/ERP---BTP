'use server';

import { and, asc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { employePermis, type EmployePermis } from '@/db/schema/employes';
import { permisSchema, type PermisInput } from '@/lib/validation/rh';

import { ROLES_RH_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

export async function listerPermis(employeId: string): Promise<EmployePermis[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(employePermis)
      .where(and(eq(employePermis.employeId, employeId), isNull(employePermis.deletedAt)))
      .orderBy(asc(employePermis.categorie)),
  );
}

export async function creerPermis(
  employeId: string,
  input: PermisInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  const parsed = permisSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(employePermis)
        .values({
          entrepriseId: ctx.entreprise.id,
          employeId,
          categorie: parsed.data.categorie,
          dateObtention: parsed.data.dateObtention,
          dateValidite: parsed.data.dateValidite,
          numeroPermis: parsed.data.numeroPermis,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: employePermis.id });
      if (!inserted) throw new Error('INSERT failed');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'employe_permis',
        rowId: inserted.id,
        after: { employeId, ...parsed.data },
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes/${employeId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return {
        ok: false,
        error: `Cet employé a déjà le permis ${parsed.data.categorie}.`,
      };
    }
    throw err;
  }
}

export async function mettreAJourPermis(id: string, input: PermisInput): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  const parsed = permisSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const employeId = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(employePermis)
        .where(and(eq(employePermis.id, id), isNull(employePermis.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(employePermis)
        .set({
          categorie: parsed.data.categorie,
          dateObtention: parsed.data.dateObtention,
          dateValidite: parsed.data.dateValidite,
          numeroPermis: parsed.data.numeroPermis,
          notes: parsed.data.notes,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(employePermis.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'employe_permis',
        rowId: id,
        before,
        after: parsed.data,
      });
      return before.employeId;
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes/${employeId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Permis introuvable.' };
    }
    throw err;
  }
}

export async function supprimerPermis(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(employePermis)
      .where(and(eq(employePermis.id, id), isNull(employePermis.deletedAt)));
    if (!before) return;
    await tx
      .update(employePermis)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(employePermis.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'employe_permis',
      rowId: id,
      before,
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes/${before.employeId}`);
  });
  return { ok: true, data: undefined };
}
