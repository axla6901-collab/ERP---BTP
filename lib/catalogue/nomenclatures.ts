'use server';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import {
  articles,
  nomenclatureLignes,
  nomenclatures,
  unites,
  type Nomenclature,
  type NomenclatureLigne,
} from '@/db/schema/catalogue';
import { nomenclatureSchema, type NomenclatureInput } from '@/lib/validation/catalogue';

import { ROLES_CATALOGUE_WRITE } from './permissions';
import type { ActionResult } from './types';

export type LigneHydratee = NomenclatureLigne & {
  composantCode: string;
  composantLibelle: string;
  uniteEmploiSymbole: string;
};

export type NomenclatureHydratee = Nomenclature & {
  lignes: LigneHydratee[];
};

/**
 * Helper interne : prend la transaction tenant en paramètre pour rester
 * dans le même contexte multi-tenant que l'appelant (évite d'imbriquer un
 * second withTenant — qui causerait un deadlock).
 */
async function hydraterLignes(tx: TenantTx, nomenclatureId: string): Promise<LigneHydratee[]> {
  const rows = await tx
    .select({
      ligne: nomenclatureLignes,
      composantCode: articles.code,
      composantLibelle: articles.libelle,
      uniteSymbole: unites.symbole,
    })
    .from(nomenclatureLignes)
    .leftJoin(articles, eq(nomenclatureLignes.composantArticleId, articles.id))
    .leftJoin(unites, eq(nomenclatureLignes.uniteEmploiId, unites.id))
    .where(eq(nomenclatureLignes.nomenclatureId, nomenclatureId))
    .orderBy(asc(nomenclatureLignes.ordre), asc(nomenclatureLignes.id));

  return rows.map((r) => ({
    ...r.ligne,
    composantCode: r.composantCode ?? '',
    composantLibelle: r.composantLibelle ?? '',
    uniteEmploiSymbole: r.uniteSymbole ?? '',
  }));
}

export async function lireNomenclatureCourante(
  articleId: string,
): Promise<NomenclatureHydratee | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [head] = await tx
      .select()
      .from(nomenclatures)
      .where(and(eq(nomenclatures.articleId, articleId), isNull(nomenclatures.validTo)))
      .limit(1);
    if (!head) return null;
    return { ...head, lignes: await hydraterLignes(tx, head.id) };
  });
}

export async function lireHistoriqueNomenclatures(articleId: string): Promise<NomenclatureHydratee[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const heads = await tx
      .select()
      .from(nomenclatures)
      .where(eq(nomenclatures.articleId, articleId))
      .orderBy(desc(nomenclatures.version));

    const results: NomenclatureHydratee[] = [];
    for (const h of heads) {
      results.push({ ...h, lignes: await hydraterLignes(tx, h.id) });
    }
    return results;
  });
}

export async function enregistrerNomenclature(
  articleId: string,
  input: NomenclatureInput,
): Promise<ActionResult<{ nomenclatureId: string; version: number }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  const parsed = nomenclatureSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const result = await withTenant(ctx.entreprise.id, async (tx) => {
      // 1. Fermer la version courante si elle existe
      const [courante] = await tx
        .select()
        .from(nomenclatures)
        .where(and(eq(nomenclatures.articleId, articleId), isNull(nomenclatures.validTo)));

      if (courante) {
        await tx
          .update(nomenclatures)
          .set({ validTo: new Date() })
          .where(eq(nomenclatures.id, courante.id));
      }

      // 2. Calculer la prochaine version
      const [maxRow] = await tx
        .select({ max: sql<number>`COALESCE(MAX(${nomenclatures.version}), 0)` })
        .from(nomenclatures)
        .where(eq(nomenclatures.articleId, articleId));
      const nextVersion = (maxRow?.max ?? 0) + 1;

      // 3. Insérer la nouvelle version
      const [head] = await tx
        .insert(nomenclatures)
        .values({
          entrepriseId: ctx.entreprise.id,
          articleId,
          version: nextVersion,
          libelle: parsed.data.libelle,
          createdBy: ctx.utilisateur.id,
        })
        .returning({ id: nomenclatures.id });
      if (!head) throw new Error('INSERT nomenclature failed');

      // 4. Insérer les lignes
      if (parsed.data.lignes.length > 0) {
        await tx.insert(nomenclatureLignes).values(
          parsed.data.lignes.map((l, idx) => ({
            entrepriseId: ctx.entreprise.id,
            nomenclatureId: head.id,
            ordre: idx,
            composantArticleId: l.composantArticleId,
            quantite: l.quantite,
            uniteEmploiId: l.uniteEmploiId,
            coefficientPerte: l.coefficientPerte,
            notes: l.notes,
          })),
        );
      }

      // 5. Audit log
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'nomenclatures',
        rowId: head.id,
        after: { articleId, version: nextVersion, lignes: parsed.data.lignes },
      });

      return { nomenclatureId: head.id, version: nextVersion };
    });

    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles/${articleId}/composition`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles/${articleId}`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue`);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof Error && /cycle|Cycle/i.test(err.message)) {
      return { ok: false, error: err.message.replace(/^[A-Z\d]+:\s*/, '') };
    }
    throw err;
  }
}
