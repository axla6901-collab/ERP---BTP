'use server';

import { and, asc, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import {
  articles,
  familles,
  grilleTarifaireLignes,
  nomenclatureLignes,
  unites,
  type Article,
} from '@/db/schema/catalogue';
import { composantsLigneDevis, devis, lignesDevis } from '@/db/schema/commercial';
import { lignesFacture, lignesSituation } from '@/db/schema/facturation';
import { articleSchema, type ArticleInput, type ArticleType } from '@/lib/validation/catalogue';

import { ROLES_CATALOGUE_WRITE } from './permissions';
import type { PrixSource } from './prix-source';
import type { ActionResult } from './types';

export type ArticleAvecFamille = Article & {
  familleCode: string | null;
  familleLibelle: string | null;
  uniteAchatSymbole: string | null;
  uniteStockSymbole: string | null;
  uniteVenteSymbole: string | null;
};

export type ArticleAvecPrix = ArticleAvecFamille & {
  prixCourant: string | null;
  prixSource: PrixSource | null;
  prixMissing: boolean;
  /** Prix de référence catalogue actif (fournisseur_id NULL, valid_to NULL). */
  prixReference: string | null;
  prixReferenceUniteSymbole: string | null;
  /**
   * Prix retenu quand cet article est utilisé comme composant dans une composition :
   *   - type='compose' → prix de revient calculé (bom_cost_roll, somme récursive
   *     des composants × prix_courant_article)
   *   - sinon → prix de référence
   * Sert à afficher un sous-total cohérent dans l'éditeur de composition même
   * quand le composant est lui-même un article composé.
   */
  prixComposant: string | null;
  prixComposantUniteSymbole: string | null;
  /**
   * Évolution du prix de référence sur 30 jours, en % (arrondi 0,1). `null` si
   * indisponible (pas de prix il y a 30 j) ou article composé (coût recalculé,
   * non comparé ici).
   */
  evol30jPct: number | null;
};

export type ArticlePourSelecteur = {
  id: string;
  code: string;
  libelle: string;
  uniteVenteId: string | null;
  uniteVenteSymbole: string | null;
};

/**
 * Variante allégée de `listerArticles` pour alimenter un <Select> dans un
 * formulaire (grille tarifaire, prix article, etc.) : ne récupère que les
 * colonnes affichées + l'unité de vente pour pré-remplir l'unité de la ligne.
 * Évite les JOIN famille/unite_achat/unite_stock inutiles à ce contexte.
 */
export async function listerArticlesPourSelecteur(): Promise<ArticlePourSelecteur[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: articles.id,
        code: articles.code,
        libelle: articles.libelle,
        uniteVenteId: articles.uniteVenteId,
        uniteVenteSymbole: unites.symbole,
      })
      .from(articles)
      .leftJoin(unites, eq(articles.uniteVenteId, unites.id))
      .where(and(isNull(articles.deletedAt), eq(articles.actif, true)))
      .orderBy(asc(articles.code)),
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    libelle: r.libelle,
    uniteVenteId: r.uniteVenteId,
    uniteVenteSymbole: r.uniteVenteSymbole ?? null,
  }));
}

export async function listerArticles(typeFilter?: ArticleType): Promise<ArticleAvecFamille[]> {
  const ctx = await requireTenantContextWithMfa();
  const conditions = [isNull(articles.deletedAt)];
  if (typeFilter) conditions.push(eq(articles.type, typeFilter));

  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        article: articles,
        famille: { code: familles.code, libelle: familles.libelle },
        uniteAchat: unites.symbole,
      })
      .from(articles)
      .leftJoin(familles, eq(articles.familleId, familles.id))
      .leftJoin(unites, eq(articles.uniteAchatId, unites.id))
      .where(and(...conditions))
      .orderBy(asc(articles.code));

    // Récupère les symboles d'unité stock/vente en une requête séparée (évite triple join)
    const uniteIds = new Set<string>();
    for (const r of rows) {
      if (r.article.uniteStockId) uniteIds.add(r.article.uniteStockId);
      if (r.article.uniteVenteId) uniteIds.add(r.article.uniteVenteId);
    }
    const symboles = new Map<string, string>();
    if (uniteIds.size > 0) {
      const us = await tx
        .select({ id: unites.id, symbole: unites.symbole })
        .from(unites);
      for (const u of us) symboles.set(u.id, u.symbole);
    }

    return rows.map((r) => ({
      ...r.article,
      familleCode: r.famille?.code ?? null,
      familleLibelle: r.famille?.libelle ?? null,
      uniteAchatSymbole: r.uniteAchat ?? null,
      uniteStockSymbole: r.article.uniteStockId ? symboles.get(r.article.uniteStockId) ?? null : null,
      uniteVenteSymbole: r.article.uniteVenteId ? symboles.get(r.article.uniteVenteId) ?? null : null,
    }));
  });
}

/**
 * Variante enrichie : pour chaque article, calcule le prix courant retenu :
 *   - `type=compose` → `bom_cost_roll` (peut être incomplet si composants sans prix)
 *   - autres → `prix_courant_article` (prix de référence prioritaire dès qu'il
 *     est renseigné, sinon prix/grilles fournisseurs en repli — cf. migration 0067)
 *
 * Utilise une seule requête SQL avec sous-requêtes scalaires sur les fonctions PG.
 */
export async function listerArticlesAvecPrix(typeFilter?: ArticleType): Promise<ArticleAvecPrix[]> {
  const ctx = await requireTenantContextWithMfa();

  const typeFilterSql = typeFilter ? sql`AND a.type = ${typeFilter}::article_type` : sql``;

  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx.execute<{
      id: string;
      code: string;
      libelle: string;
      famille_id: string;
      type: ArticleType;
      unite_achat_id: string | null;
      unite_stock_id: string | null;
      unite_vente_id: string | null;
      fournisseur_prefere_id: string | null;
      densite: string | null;
      epaisseur: string | null;
      longueur_std: string | null;
      largeur_std: string | null;
      description: string | null;
      actif: boolean;
      favori: boolean;
      created_at: Date;
      updated_at: Date;
      created_by: string | null;
      updated_by: string | null;
      deleted_at: Date | null;
      entreprise_id: string;
      famille_code: string | null;
      famille_libelle: string | null;
      unite_achat_symbole: string | null;
      unite_stock_symbole: string | null;
      unite_vente_symbole: string | null;
      prix_courant: string | null;
      prix_source: string | null;
      prix_missing: boolean;
      prix_reference: string | null;
      prix_reference_unite_symbole: string | null;
      prix_composant: string | null;
      prix_composant_unite_symbole: string | null;
      evol30j_pct: string | null;
    }>(sql`
      SELECT
        a.*,
        f.code AS famille_code,
        f.libelle AS famille_libelle,
        ua.symbole AS unite_achat_symbole,
        us.symbole AS unite_stock_symbole,
        uv.symbole AS unite_vente_symbole,
        CASE
          WHEN a.type = 'compose' THEN (SELECT total FROM bom_cost_roll(a.id, CURRENT_DATE))
          ELSE (SELECT prix FROM prix_courant_article(a.id, CURRENT_DATE) LIMIT 1)
        END AS prix_courant,
        CASE
          WHEN a.type = 'compose' THEN 'calcule'::text
          ELSE (SELECT source FROM prix_courant_article(a.id, CURRENT_DATE) LIMIT 1)
        END AS prix_source,
        CASE
          WHEN a.type = 'compose' THEN COALESCE((SELECT missing_count FROM bom_cost_roll(a.id, CURRENT_DATE)) > 0, true)
          ELSE (SELECT prix FROM prix_courant_article(a.id, CURRENT_DATE) LIMIT 1) IS NULL
        END AS prix_missing,
        pref.prix_unitaire_ht AS prix_reference,
        pref.unite_symbole AS prix_reference_unite_symbole,
        CASE
          WHEN a.type = 'compose' THEN (SELECT total FROM bom_cost_roll(a.id, CURRENT_DATE))
          ELSE pref.prix_unitaire_ht
        END AS prix_composant,
        CASE
          WHEN a.type = 'compose' THEN uv.symbole
          ELSE pref.unite_symbole
        END AS prix_composant_unite_symbole,
        CASE
          WHEN a.type = 'compose' THEN NULL
          ELSE round(
            (
              ((SELECT prix FROM prix_courant_article(a.id, CURRENT_DATE) LIMIT 1)
                - (SELECT prix FROM prix_courant_article(a.id, CURRENT_DATE - 30) LIMIT 1))
              / NULLIF((SELECT prix FROM prix_courant_article(a.id, CURRENT_DATE - 30) LIMIT 1), 0)
              * 100
            )::numeric,
            1
          )
        END AS evol30j_pct
      FROM articles a
      LEFT JOIN familles f ON f.id = a.famille_id
      LEFT JOIN unites ua ON ua.id = a.unite_achat_id
      LEFT JOIN unites us ON us.id = a.unite_stock_id
      LEFT JOIN unites uv ON uv.id = a.unite_vente_id
      LEFT JOIN LATERAL (
        SELECT p.prix_unitaire_ht, u.symbole AS unite_symbole
          FROM prix_articles p
          LEFT JOIN unites u ON u.id = p.unite_id
         WHERE p.article_id = a.id
           AND p.fournisseur_id IS NULL
           AND p.valid_to IS NULL
         ORDER BY p.valid_from DESC
         LIMIT 1
      ) pref ON TRUE
      WHERE a.deleted_at IS NULL
      ${typeFilterSql}
      ORDER BY a.code ASC
    `),
  );

  return rows.map(
    (r): ArticleAvecPrix => ({
      id: r.id,
      entrepriseId: r.entreprise_id,
      code: r.code,
      libelle: r.libelle,
      familleId: r.famille_id,
      type: r.type,
      uniteAchatId: r.unite_achat_id,
      uniteStockId: r.unite_stock_id,
      uniteVenteId: r.unite_vente_id,
      fournisseurPrefereId: r.fournisseur_prefere_id,
      densite: r.densite,
      epaisseur: r.epaisseur,
      longueurStd: r.longueur_std,
      largeurStd: r.largeur_std,
      description: r.description,
      actif: r.actif,
      favori: r.favori,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      createdBy: r.created_by,
      updatedBy: r.updated_by,
      deletedAt: r.deleted_at,
      familleCode: r.famille_code,
      familleLibelle: r.famille_libelle,
      uniteAchatSymbole: r.unite_achat_symbole,
      uniteStockSymbole: r.unite_stock_symbole,
      uniteVenteSymbole: r.unite_vente_symbole,
      prixCourant: r.prix_courant,
      prixSource: (r.prix_source as ArticleAvecPrix['prixSource']) ?? null,
      prixMissing: r.prix_missing,
      prixReference: r.prix_reference,
      prixReferenceUniteSymbole: r.prix_reference_unite_symbole,
      prixComposant: r.prix_composant,
      prixComposantUniteSymbole: r.prix_composant_unite_symbole,
      evol30jPct: r.evol30j_pct == null ? null : Number(r.evol30j_pct),
    }),
  );
}

export async function lireArticle(id: string): Promise<Article | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}

/**
 * Identifiants des articles utilisés sur un chantier donné, dérivés des lignes
 * des devis rattachés à ce chantier (« fil rouge » contexte chantier). Sert à
 * prioriser/surligner ces articles dans le catalogue.
 *
 * ⚠ `devis.chantier_id` est un placeholder M4 sans FK → on filtre simplement
 * dessus. La RLS (via `withTenant`) garantit le périmètre entreprise.
 */
export async function listerArticleIdsParChantier(chantierId: string): Promise<string[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .selectDistinct({ articleId: lignesDevis.articleId })
      .from(lignesDevis)
      .innerJoin(devis, eq(lignesDevis.devisId, devis.id))
      .where(
        and(
          eq(devis.chantierId, chantierId),
          isNull(devis.deletedAt),
          isNotNull(lignesDevis.articleId),
        ),
      ),
  );
  return rows
    .map((r) => r.articleId)
    .filter((id): id is string => id != null);
}

export async function creerArticle(input: ArticleInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(articles)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          familleId: parsed.data.familleId,
          type: parsed.data.type,
          uniteAchatId: parsed.data.uniteAchatId,
          uniteStockId: parsed.data.uniteStockId,
          uniteVenteId: parsed.data.uniteVenteId,
          densite: parsed.data.densite,
          epaisseur: parsed.data.epaisseur,
          longueurStd: parsed.data.longueurStd,
          largeurStd: parsed.data.largeurStd,
          description: parsed.data.description,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: articles.id });
      if (!inserted) throw new Error('INSERT failed silently');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'articles',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    if (err instanceof Error && /foreign key/i.test(err.message)) {
      return { ok: false, error: 'Référence introuvable (famille ou unité).' };
    }
    throw err;
  }
}

export async function mettreAJourArticle(
  id: string,
  input: ArticleInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), isNull(articles.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(articles)
        .set({
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          familleId: parsed.data.familleId,
          type: parsed.data.type,
          uniteAchatId: parsed.data.uniteAchatId,
          uniteStockId: parsed.data.uniteStockId,
          uniteVenteId: parsed.data.uniteVenteId,
          densite: parsed.data.densite,
          epaisseur: parsed.data.epaisseur,
          longueurStd: parsed.data.longueurStd,
          largeurStd: parsed.data.largeurStd,
          description: parsed.data.description,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(articles.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'articles',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Article introuvable ou supprimé.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

/**
 * Bascule l'indicateur « favori » d'un article (niveau entreprise). Idempotent :
 * ne fait rien si l'état est déjà celui demandé. Trace l'opération dans l'audit.
 */
export async function toggleFavoriArticle(id: string, favori: boolean): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(articles)
        .where(and(eq(articles.id, id), isNull(articles.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      if (before.favori === favori) return; // déjà dans l'état voulu

      await tx
        .update(articles)
        .set({ favori, updatedBy: ctx.utilisateur.id })
        .where(eq(articles.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'articles',
        rowId: id,
        before,
        after: { ...before, favori },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles`);
    revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Article introuvable ou supprimé.' };
    }
    throw err;
  }
}

export async function supprimerArticle(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  // Soft-delete : pas de déclenchement FK → on vérifie explicitement que
  // l'article n'est utilisé nulle part (devis, factures, situations, grilles,
  // nomenclatures). Les prix (`prix_articles`) et nomenclatures dont il est
  // l'article racine sont en cascade → ne comptent pas.
  const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(articles)
      .where(and(eq(articles.id, id), isNull(articles.deletedAt)));
    if (!before) return null;

    const compte = async (table: PgTable, col: PgColumn) => {
      const [r] = await tx.select({ n: count() }).from(table).where(eq(col, id));
      return r?.n ?? 0;
    };
    const nDevis =
      (await compte(lignesDevis, lignesDevis.articleId)) +
      (await compte(composantsLigneDevis, composantsLigneDevis.articleId));
    const nFactures = await compte(lignesFacture, lignesFacture.articleId);
    const nSituations = await compte(lignesSituation, lignesSituation.articleId);
    const nGrilles = await compte(grilleTarifaireLignes, grilleTarifaireLignes.articleId);
    const nNomenclatures = await compte(nomenclatureLignes, nomenclatureLignes.composantArticleId);

    const message = messageBlocageSuppression('cet article', [
      { nombre: nDevis, singulier: 'ligne de devis', pluriel: 'lignes de devis' },
      { nombre: nFactures, singulier: 'ligne de facture', pluriel: 'lignes de facture' },
      { nombre: nSituations, singulier: 'ligne de situation', pluriel: 'lignes de situation' },
      { nombre: nGrilles, singulier: 'grille tarifaire', pluriel: 'grilles tarifaires' },
      { nombre: nNomenclatures, singulier: 'nomenclature', pluriel: 'nomenclatures' },
    ]);
    if (message) return message;

    await tx
      .update(articles)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(articles.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'articles',
      rowId: id,
      before,
    });
    return null;
  });

  if (blocage) return { ok: false, error: blocage };
  revalidatePath(`/${ctx.entreprise.slug}/catalogue/articles`);
  revalidatePath(`/${ctx.entreprise.slug}/catalogue`);
  return { ok: true, data: undefined };
}
