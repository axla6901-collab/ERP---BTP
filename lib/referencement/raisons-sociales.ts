'use server';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { clients } from '@/db/schema/commercial';
import { fournisseurs } from '@/db/schema/catalogue';
import { raisonsSociales, type RaisonSociale } from '@/db/schema/raisons-sociales';
import { societes } from '@/db/schema/societes';
import { sousTraitants } from '@/db/schema/tiers';
import { auditLogIn } from '@/lib/audit/log';
import { ROLES_ADMINISTRATION } from '@/lib/admin/permissions';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { raisonSocialeSchema, type RaisonSocialeInput } from '@/lib/validation/raisons-sociales';

function pathBase(slug: string) {
  return `/${slug}/administration/raisons-sociales`;
}

export async function listerRaisonsSociales(): Promise<RaisonSociale[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(raisonsSociales)
      .where(isNull(raisonsSociales.deletedAt))
      .orderBy(asc(raisonsSociales.raisonSociale)),
  );
}

/** Noms actifs (pour l'autocomplétion des formulaires client/fournisseur/…). */
export async function listerRaisonsSocialesActives(): Promise<string[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ raisonSociale: raisonsSociales.raisonSociale })
      .from(raisonsSociales)
      .where(and(isNull(raisonsSociales.deletedAt), eq(raisonsSociales.actif, true)))
      .orderBy(asc(raisonsSociales.raisonSociale)),
  );
  return rows.map((r) => r.raisonSociale);
}

export async function lireRaisonSociale(id: string): Promise<RaisonSociale | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(raisonsSociales)
      .where(and(eq(raisonsSociales.id, id), isNull(raisonsSociales.deletedAt)))
      .limit(1);
    return row ?? null;
  });
}

export async function creerRaisonSociale(
  input: RaisonSocialeInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  const parsed = raisonSocialeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(raisonsSociales)
        .values({
          entrepriseId: ctx.entreprise.id,
          raisonSociale: parsed.data.raisonSociale,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: raisonsSociales.id });
      if (!inserted) throw new Error('INSERT failed silently');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'raisons_sociales',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(pathBase(ctx.entreprise.slug));
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return {
        ok: false,
        error: `La raison sociale « ${parsed.data.raisonSociale} » existe déjà.`,
      };
    }
    throw err;
  }
}

export async function mettreAJourRaisonSociale(
  id: string,
  input: RaisonSocialeInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  const parsed = raisonSocialeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(raisonsSociales)
        .where(and(eq(raisonsSociales.id, id), isNull(raisonsSociales.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(raisonsSociales)
        .set({
          raisonSociale: parsed.data.raisonSociale,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(raisonsSociales.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'raisons_sociales',
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
      return { ok: false, error: 'Raison sociale introuvable ou supprimée.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return {
        ok: false,
        error: `La raison sociale « ${parsed.data.raisonSociale} » existe déjà.`,
      };
    }
    throw err;
  }
}

export async function supprimerRaisonSociale(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(raisonsSociales)
      .where(and(eq(raisonsSociales.id, id), isNull(raisonsSociales.deletedAt)))
      .limit(1);
    if (!before) return { ok: true, data: undefined };

    // Garde-fou référentiel : refus si la raison sociale est encore reliée à
    // une entité (le soft-delete ne déclenche pas les FK → compte explicite).
    const [cli] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.raisonSocialeId, id));
    const [four] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(fournisseurs)
      .where(eq(fournisseurs.raisonSocialeId, id));
    const [st] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sousTraitants)
      .where(eq(sousTraitants.raisonSocialeId, id));
    const [soc] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(societes)
      .where(eq(societes.raisonSocialeId, id));
    const message = messageBlocageSuppression('cette raison sociale', [
      { nombre: Number(cli?.n ?? 0), singulier: 'client', pluriel: 'clients' },
      { nombre: Number(four?.n ?? 0), singulier: 'fournisseur', pluriel: 'fournisseurs' },
      { nombre: Number(st?.n ?? 0), singulier: 'sous-traitant', pluriel: 'sous-traitants' },
      { nombre: Number(soc?.n ?? 0), singulier: 'société', pluriel: 'sociétés' },
    ]);
    if (message) return { ok: false, error: message };

    await tx
      .update(raisonsSociales)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(raisonsSociales.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'raisons_sociales', rowId: id, before });
    revalidatePath(pathBase(ctx.entreprise.slug));
    return { ok: true, data: undefined };
  });
}
