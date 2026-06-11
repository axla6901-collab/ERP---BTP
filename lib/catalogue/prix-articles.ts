'use server';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import {
  articles,
  fournisseurs,
  prixArticles,
  unites,
  type PrixArticle,
} from '@/db/schema/catalogue';
import { prixArticleSchema, type PrixArticleInput } from '@/lib/validation/catalogue';

import { ROLES_CATALOGUE_WRITE } from './permissions';
import type { ActionResult } from './types';

export type PrixHydrate = PrixArticle & {
  uniteSymbole: string | null;
  fournisseurNom: string | null;
  fournisseurCode: string | null;
};

export async function listerPrixArticle(articleId: string): Promise<PrixHydrate[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        prix: prixArticles,
        uniteSymbole: unites.symbole,
        fournisseurNom: fournisseurs.nom,
        fournisseurCode: fournisseurs.code,
      })
      .from(prixArticles)
      .leftJoin(unites, eq(prixArticles.uniteId, unites.id))
      .leftJoin(fournisseurs, eq(prixArticles.fournisseurId, fournisseurs.id))
      .where(eq(prixArticles.articleId, articleId))
      .orderBy(desc(prixArticles.validFrom)),
  );

  return rows.map((r) => ({
    ...r.prix,
    uniteSymbole: r.uniteSymbole ?? null,
    fournisseurNom: r.fournisseurNom ?? null,
    fournisseurCode: r.fournisseurCode ?? null,
  }));
}

export type PrixCourant = {
  prix: string | null;
  uniteId: string | null;
  fournisseurId: string | null;
  source: 'grille_prefere' | 'prefere' | 'reference' | 'grille_mini' | 'mini_fournisseur' | null;
};

export async function prixCourant(articleId: string, atDate?: string): Promise<PrixCourant> {
  const ctx = await requireTenantContextWithMfa();
  const date = atDate ?? new Date().toISOString().slice(0, 10);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx.execute<{
      prix: string;
      unite_id: string;
      fournisseur_id: string | null;
      source: string;
    }>(
      sql`SELECT prix, unite_id, fournisseur_id, source FROM prix_courant_article(${articleId}::uuid, ${date}::date)`,
    ),
  );
  const first = rows[0];
  if (!first) return { prix: null, uniteId: null, fournisseurId: null, source: null };
  return {
    prix: first.prix,
    uniteId: first.unite_id,
    fournisseurId: first.fournisseur_id,
    source: first.source as PrixCourant['source'],
  };
}

export type PrixReferenceCourant = {
  prixUnitaireHt: string;
  uniteId: string;
  uniteSymbole: string | null;
  validFrom: string;
};

/**
 * Lit le prix de référence actif (fournisseur_id NULL, valid_to NULL) le plus
 * récent pour un article. Sert au champ rapide « Prix de référence » de la
 * fiche article. Renvoie null si aucun prix de référence ouvert n'existe.
 */
export async function lirePrixReferenceCourant(
  articleId: string,
): Promise<PrixReferenceCourant | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        prixUnitaireHt: prixArticles.prixUnitaireHt,
        uniteId: prixArticles.uniteId,
        uniteSymbole: unites.symbole,
        validFrom: prixArticles.validFrom,
      })
      .from(prixArticles)
      .leftJoin(unites, eq(prixArticles.uniteId, unites.id))
      .where(
        and(
          eq(prixArticles.articleId, articleId),
          isNull(prixArticles.fournisseurId),
          isNull(prixArticles.validTo),
        ),
      )
      .orderBy(desc(prixArticles.validFrom))
      .limit(1),
  );
  if (!row) return null;
  return {
    prixUnitaireHt: row.prixUnitaireHt,
    uniteId: row.uniteId,
    uniteSymbole: row.uniteSymbole ?? null,
    validFrom: row.validFrom,
  };
}

export async function enregistrerPrix(
  articleId: string,
  input: PrixArticleInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  const parsed = prixArticleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      // Fermer l'ancien prix courant pour la même paire (article, fournisseur)
      // si valid_from du nouveau >= valid_from de l'ancien actif
      // → valid_to de l'ancien = nouveau valid_from - 1 jour
      const fournisseurFilter = parsed.data.fournisseurId
        ? eq(prixArticles.fournisseurId, parsed.data.fournisseurId)
        : sql`${prixArticles.fournisseurId} IS NULL`;

      await tx
        .update(prixArticles)
        .set({ validTo: sql`(${parsed.data.validFrom}::date - INTERVAL '1 day')::date` })
        .where(
          and(
            eq(prixArticles.articleId, articleId),
            fournisseurFilter,
            sql`${prixArticles.validTo} IS NULL`,
            sql`${prixArticles.validFrom} <= ${parsed.data.validFrom}::date`,
          ),
        );

      const [inserted] = await tx
        .insert(prixArticles)
        .values({
          entrepriseId: ctx.entreprise.id,
          articleId,
          prixUnitaireHt: parsed.data.prixUnitaireHt,
          uniteId: parsed.data.uniteId,
          fournisseurId: parsed.data.fournisseurId,
          referenceFournisseur: parsed.data.referenceFournisseur,
          quantiteMin: parsed.data.quantiteMin,
          validFrom: parsed.data.validFrom,
          validTo: parsed.data.validTo,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
        })
        .returning({ id: prixArticles.id });
      if (!inserted) throw new Error('INSERT prix failed');

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'prix_articles',
        rowId: inserted.id,
        after: parsed.data,
      });

      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles/${articleId}/prix`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles/${articleId}`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles`);
    return { ok: true, data: { id } };
  } catch (err) {
    throw err;
  }
}

/**
 * Wrapper ergonomique pour saisir uniquement le prix de référence courant
 * (sans fournisseur, sans dates). Réutilise `enregistrerPrix` qui ferme
 * automatiquement le précédent prix de référence ouvert via valid_to.
 *
 * Le `prixUnitaireHt` brut (string venant d'un input texte) est normalisé
 * par le schéma Zod via safeParse (virgule décimale, etc.).
 */
export async function enregistrerPrixReference(
  articleId: string,
  input: { prixUnitaireHt: string; uniteId: string },
): Promise<ActionResult<{ id: string }>> {
  const today = new Date().toISOString().slice(0, 10);
  return enregistrerPrix(articleId, {
    prixUnitaireHt: input.prixUnitaireHt,
    uniteId: input.uniteId,
    fournisseurId: null,
    referenceFournisseur: null,
    quantiteMin: null,
    validFrom: today,
    validTo: null,
    notes: null,
  });
}

export async function definirFournisseurPrefere(
  articleId: string,
  fournisseurId: string | null,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select({ id: articles.id, fournisseurPrefereId: articles.fournisseurPrefereId })
      .from(articles)
      .where(eq(articles.id, articleId));
    if (!before) return;
    await tx
      .update(articles)
      .set({ fournisseurPrefereId: fournisseurId, updatedBy: ctx.utilisateur.id })
      .where(eq(articles.id, articleId));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'articles',
      rowId: articleId,
      before: { fournisseurPrefereId: before.fournisseurPrefereId },
      after: { fournisseurPrefereId: fournisseurId },
    });
  });
  revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles/${articleId}/prix`);
  revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles/${articleId}`);
  return { ok: true, data: undefined };
}
