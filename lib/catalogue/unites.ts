'use server';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
// eslint-disable-next-line no-restricted-imports -- référentiel global (table `unites` sans entreprise_id, pas de RLS tenant)
import { db } from '@/lib/db/client';
import { withTenant } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { unites, type Unite } from '@/db/schema/catalogue';
import { ROLES_ADMINISTRATION } from '@/lib/admin/permissions';
import { uniteSchema, type UniteInput } from '@/lib/validation/catalogue';

import type { ActionResult } from './types';

export async function listerUnites(): Promise<Unite[]> {
  await requireAuthWithMfa();
  return db
    .select()
    .from(unites)
    .where(isNull(unites.deletedAt))
    .orderBy(asc(unites.type), asc(unites.code));
}

export async function lireUnite(id: string): Promise<Unite | null> {
  await requireAuthWithMfa();
  const [row] = await db
    .select()
    .from(unites)
    .where(and(eq(unites.id, id), isNull(unites.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function creerUnite(input: UniteInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  const utilisateur = ctx.utilisateur;
  const parsed = uniteSchema.safeParse(input);
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
        .insert(unites)
        .values({
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          symbole: parsed.data.symbole,
          type: parsed.data.type,
          actif: parsed.data.actif,
          createdBy: utilisateur.id,
          updatedBy: utilisateur.id,
        })
        .returning({ id: unites.id });
      if (!inserted) throw new Error('INSERT failed silently');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'unites',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/unites`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

export async function mettreAJourUnite(id: string, input: UniteInput): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  const utilisateur = ctx.utilisateur;
  const parsed = uniteSchema.safeParse(input);
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
        .from(unites)
        .where(and(eq(unites.id, id), isNull(unites.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(unites)
        .set({
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          symbole: parsed.data.symbole,
          type: parsed.data.type,
          actif: parsed.data.actif,
          updatedBy: utilisateur.id,
        })
        .where(eq(unites.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'unites',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/unites`);
    revalidatePath(`/${ctx.entreprise.slug}/administration/unites/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Unité introuvable ou supprimée.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

export async function supprimerUnite(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  const utilisateur = ctx.utilisateur;
  try {
    const [before] = await db
      .select()
      .from(unites)
      .where(and(eq(unites.id, id), isNull(unites.deletedAt)))
      .limit(1);
    if (!before) return { ok: true, data: undefined };

    // `unites` est un référentiel GLOBAL ; ses tables référençantes sont
    // tenant-scoped (RLS). Le comptage « utilisée par n'importe quel tenant »
    // passe par la fonction SECURITY DEFINER `compter_usage_unite` (migration
    // 0051), appelable par app_rw — pas besoin du pool admin. Les conversions
    // (`unite_conversions`) sont en cascade et ne comptent pas.
    const usage = await db.execute(sql`SELECT * FROM compter_usage_unite(${id}::uuid)`);
    const u = (usage as unknown as Array<Record<string, number>>)[0];
    const message = messageBlocageSuppression('cette unité', [
      { nombre: Number(u?.nb_articles ?? 0), singulier: 'article', pluriel: 'articles' },
      { nombre: Number(u?.nb_prix ?? 0), singulier: "prix d'article", pluriel: "prix d'articles" },
      {
        nombre: Number(u?.nb_grilles ?? 0),
        singulier: 'ligne de grille tarifaire',
        pluriel: 'lignes de grille tarifaire',
      },
      {
        nombre: Number(u?.nb_nomenclatures ?? 0),
        singulier: 'ligne de nomenclature',
        pluriel: 'lignes de nomenclature',
      },
    ]);
    if (message) return { ok: false, error: message };

    await withTenant(ctx.entreprise.id, async (tx) => {
      await tx
        .update(unites)
        .set({ deletedAt: new Date(), updatedBy: utilisateur.id })
        .where(eq(unites.id, id));
      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'unites',
        rowId: id,
        before,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/unites`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && /compter_usage_unite|does not exist/i.test(err.message)) {
      // Fonction non encore déployée (migration 0051) : message clair, pas de 500.
      return {
        ok: false,
        error: "Vérification d'usage indisponible : appliquer la migration 0051.",
      };
    }
    throw err;
  }
}
