'use server';

import { and, asc, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { articles, familles, type Famille } from '@/db/schema/catalogue';
import { familleSchema, type FamilleInput } from '@/lib/validation/catalogue';

import { ROLES_CATALOGUE_WRITE } from './permissions';
import type { ActionResult } from './types';

export type FamilleAvecParent = Famille & {
  parentCode: string | null;
  parentLibelle: string | null;
};

export async function listerFamilles(): Promise<FamilleAvecParent[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx.select().from(familles).where(isNull(familles.deletedAt)).orderBy(asc(familles.code)),
  );

  const byId = new Map(rows.map((r) => [r.id, r] as const));
  return rows.map((r) => {
    const parent = r.parentId ? byId.get(r.parentId) : undefined;
    return {
      ...r,
      parentCode: parent?.code ?? null,
      parentLibelle: parent?.libelle ?? null,
    };
  });
}

export async function lireFamille(id: string): Promise<Famille | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(familles)
      .where(and(eq(familles.id, id), isNull(familles.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}

export async function creerFamille(input: FamilleInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  const parsed = familleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(familles)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          parentId: parsed.data.parentId,
          description: parsed.data.description,
          ordre: parsed.data.ordre,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: familles.id });
      if (!inserted) throw new Error('INSERT failed silently');

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'familles',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/familles`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    if (err instanceof Error && /cycle|profondeur/i.test(err.message)) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export async function mettreAJourFamille(
  id: string,
  input: FamilleInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  const parsed = familleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(familles)
        .where(and(eq(familles.id, id), isNull(familles.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(familles)
        .set({
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          parentId: parsed.data.parentId,
          description: parsed.data.description,
          ordre: parsed.data.ordre,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(familles.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'familles',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/familles`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/familles/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Famille introuvable ou supprimée.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    if (err instanceof Error && /cycle|profondeur/i.test(err.message)) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export async function supprimerFamille(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);

  // Soft-delete : pas de FK déclenchée → on vérifie que la famille n'a ni
  // sous-famille ni article rattaché.
  const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(familles)
      .where(and(eq(familles.id, id), isNull(familles.deletedAt)));
    if (!before) return null;

    const [rSousFamilles] = await tx
      .select({ n: count() })
      .from(familles)
      .where(eq(familles.parentId, id));
    const [rArticles] = await tx
      .select({ n: count() })
      .from(articles)
      .where(eq(articles.familleId, id));

    const message = messageBlocageSuppression('cette famille', [
      { nombre: rSousFamilles?.n ?? 0, singulier: 'sous-famille', pluriel: 'sous-familles' },
      { nombre: rArticles?.n ?? 0, singulier: 'article', pluriel: 'articles' },
    ]);
    if (message) return message;

    await tx
      .update(familles)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(familles.id, id));

    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'familles',
      rowId: id,
      before,
    });
    return null;
  });

  if (blocage) return { ok: false, error: blocage };
  revalidatePath(`/${ctx.entreprise.slug}/catalogue/familles`);
  revalidatePath(`/${ctx.entreprise.slug}/catalogue`);
  return { ok: true, data: undefined };
}
