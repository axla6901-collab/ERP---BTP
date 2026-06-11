'use server';

import { and, asc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { employeHabilitations, type EmployeHabilitation } from '@/db/schema/employes';
import { habilitationSchema, type HabilitationInput } from '@/lib/validation/rh';

import { ROLES_RH_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

export async function listerHabilitations(employeId: string): Promise<EmployeHabilitation[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(employeHabilitations)
      .where(
        and(eq(employeHabilitations.employeId, employeId), isNull(employeHabilitations.deletedAt)),
      )
      .orderBy(asc(employeHabilitations.dateValidite)),
  );
}

export async function creerHabilitation(
  employeId: string,
  input: HabilitationInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  const parsed = habilitationSchema.safeParse(input);
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
        .insert(employeHabilitations)
        .values({
          entrepriseId: ctx.entreprise.id,
          employeId,
          type: parsed.data.type,
          dateObtention: parsed.data.dateObtention,
          dateValidite: parsed.data.dateValidite,
          numero: parsed.data.numero,
          organisme: parsed.data.organisme,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: employeHabilitations.id });
      if (!inserted) throw new Error('INSERT failed');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'employe_habilitations',
        rowId: inserted.id,
        after: { employeId, ...parsed.data },
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes/${employeId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    throw err;
  }
}

export async function mettreAJourHabilitation(
  id: string,
  input: HabilitationInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  const parsed = habilitationSchema.safeParse(input);
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
        .from(employeHabilitations)
        .where(and(eq(employeHabilitations.id, id), isNull(employeHabilitations.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(employeHabilitations)
        .set({
          type: parsed.data.type,
          dateObtention: parsed.data.dateObtention,
          dateValidite: parsed.data.dateValidite,
          numero: parsed.data.numero,
          organisme: parsed.data.organisme,
          notes: parsed.data.notes,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(employeHabilitations.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'employe_habilitations',
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
      return { ok: false, error: 'Habilitation introuvable.' };
    }
    throw err;
  }
}

export async function supprimerHabilitation(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(employeHabilitations)
      .where(and(eq(employeHabilitations.id, id), isNull(employeHabilitations.deletedAt)));
    if (!before) return;
    await tx
      .update(employeHabilitations)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(employeHabilitations.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'employe_habilitations',
      rowId: id,
      before,
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes/${before.employeId}`);
  });
  return { ok: true, data: undefined };
}
