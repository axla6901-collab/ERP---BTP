'use server';

import { and, asc, eq, sql } from 'drizzle-orm';

import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import {
  articles,
  nomenclatureLignes,
  nomenclatures,
  unites,
} from '@/db/schema/catalogue';
import type { ArticleType } from '@/lib/validation/catalogue';

export type LigneBomEclatee = {
  profondeur: number;
  chemin: string;
  composantId: string;
  composantCode: string;
  composantLibelle: string;
  composantType: 'simple' | 'compose' | 'prestation' | 'operation';
  quantiteBrute: string;
  quantiteAvecPerte: string;
  coefficientPerte: string;
  uniteEmploiId: string;
  estFeuille: boolean;
  ligneId: string;
};

/**
 * Explose la nomenclature d'un article récursivement à une date donnée.
 * Renvoie la composition aplatie : pour un ouvrage `MUR-AGGLO-M2`, les composants
 * directs (moellon, sable, ciment, MO) avec leur quantité avec perte.
 */
export async function expliciterBom(
  articleId: string,
  atDate?: string,
): Promise<LigneBomEclatee[]> {
  const ctx = await requireTenantContextWithMfa();
  const date = atDate ?? new Date().toISOString().slice(0, 10);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx.execute<{
      profondeur: number;
      chemin: string;
      composant_id: string;
      composant_code: string;
      composant_libelle: string;
      composant_type: 'simple' | 'compose' | 'prestation' | 'operation';
      quantite_brute: string;
      quantite_avec_perte: string;
      coefficient_perte: string;
      unite_emploi_id: string;
      est_feuille: boolean;
      ligne_id: string;
    }>(sql`SELECT * FROM bom_explode(${articleId}::uuid, ${date}::date)`),
  );

  return rows.map((r) => ({
    profondeur: r.profondeur,
    chemin: r.chemin,
    composantId: r.composant_id,
    composantCode: r.composant_code,
    composantLibelle: r.composant_libelle,
    composantType: r.composant_type,
    quantiteBrute: r.quantite_brute,
    quantiteAvecPerte: r.quantite_avec_perte,
    coefficientPerte: r.coefficient_perte,
    uniteEmploiId: r.unite_emploi_id,
    estFeuille: r.est_feuille,
    ligneId: r.ligne_id,
  }));
}

export type PrixRevient =
  | { ok: true; total: string; missingCount: 0; missingArticles: string[] }
  | { ok: false; total: string; missingCount: number; missingArticles: string[] };

/**
 * Calcule le prix de revient d'un article (récursif).
 * Retourne le total et la liste des articles feuilles sans prix valide.
 */
export async function calculerPrixRevient(articleId: string, atDate?: string): Promise<PrixRevient> {
  const ctx = await requireTenantContextWithMfa();
  const date = atDate ?? new Date().toISOString().slice(0, 10);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx.execute<{
      total: string;
      missing_count: number;
      missing_articles: string[];
    }>(sql`SELECT total, missing_count, missing_articles FROM bom_cost_roll(${articleId}::uuid, ${date}::date)`),
  );
  const first = rows[0];
  if (!first) return { ok: true, total: '0.00', missingCount: 0, missingArticles: [] };

  const result = {
    total: first.total,
    missingCount: first.missing_count,
    missingArticles: first.missing_articles ?? [],
  };
  if (result.missingCount === 0) {
    return { ok: true, ...result, missingCount: 0 };
  }
  return { ok: false, ...result };
}

/**
 * Nœud de l'arbre BOM destiné à un affichage récursif pliable (chevron).
 * Chaque nœud représente une ligne de nomenclature : composant + quantité +
 * unité + perte. Si le composant est lui-même composé, `enfants` contient ses
 * propres lignes (sa nomenclature courante) ; sinon null.
 */
export type ArbreBomNoeud = {
  ligneId: string;
  composantArticleId: string;
  composantCode: string;
  composantLibelle: string;
  composantType: ArticleType;
  quantite: string;
  uniteEmploiId: string;
  uniteEmploiSymbole: string;
  coefficientPerte: string;
  notes: string | null;
  /** null = composant non-composé OU profondeur max atteinte. */
  enfants: ArbreBomNoeud[] | null;
};

/**
 * Charge récursivement l'arbre de composition d'un article composé. Pour
 * chaque composant lui-même composé, descend dans sa propre nomenclature
 * courante jusqu'à `profondeurMax` niveaux. Sert à l'affichage chevron
 * pliable sur la fiche article composé.
 */
export async function chargerArbreBom(
  articleId: string,
  profondeurMax = 8,
): Promise<ArbreBomNoeud[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    chargerArbreBomInterne(tx, articleId, profondeurMax),
  );
}

async function chargerArbreBomInterne(
  tx: TenantTx,
  articleId: string,
  profondeurMax: number,
): Promise<ArbreBomNoeud[]> {
  if (profondeurMax <= 0) return [];

  // Charge la BOM courante de l'article + métadonnées composant en une requête
  const rows = await tx
    .select({
      ligne: nomenclatureLignes,
      composantCode: articles.code,
      composantLibelle: articles.libelle,
      composantType: articles.type,
      uniteEmploiSymbole: unites.symbole,
    })
    .from(nomenclatures)
    .innerJoin(
      nomenclatureLignes,
      eq(nomenclatureLignes.nomenclatureId, nomenclatures.id),
    )
    .innerJoin(articles, eq(articles.id, nomenclatureLignes.composantArticleId))
    .leftJoin(unites, eq(unites.id, nomenclatureLignes.uniteEmploiId))
    .where(
      and(
        eq(nomenclatures.articleId, articleId),
        sql`${nomenclatures.validFrom}::date <= CURRENT_DATE`,
        sql`${nomenclatures.validTo} IS NULL OR ${nomenclatures.validTo}::date >= CURRENT_DATE`,
      ),
    )
    .orderBy(asc(nomenclatureLignes.ordre), asc(nomenclatureLignes.id));

  if (rows.length === 0) return [];

  // Pré-charger les sous-arbres pour les composants composés en parallèle
  const idsComposes = rows
    .filter((r) => r.composantType === 'compose')
    .map((r) => r.ligne.composantArticleId);
  const sousArbres = new Map<string, ArbreBomNoeud[]>();
  if (idsComposes.length > 0) {
    const uniques = Array.from(new Set(idsComposes));
    const resultats = await Promise.all(
      uniques.map((cid) => chargerArbreBomInterne(tx, cid, profondeurMax - 1)),
    );
    uniques.forEach((cid, i) => sousArbres.set(cid, resultats[i]!));
  }

  return rows.map((r) => ({
    ligneId: r.ligne.id,
    composantArticleId: r.ligne.composantArticleId,
    composantCode: r.composantCode,
    composantLibelle: r.composantLibelle,
    composantType: r.composantType,
    quantite: r.ligne.quantite,
    uniteEmploiId: r.ligne.uniteEmploiId,
    uniteEmploiSymbole: r.uniteEmploiSymbole ?? '',
    coefficientPerte: r.ligne.coefficientPerte,
    notes: r.ligne.notes,
    enfants:
      r.composantType === 'compose'
        ? sousArbres.get(r.ligne.composantArticleId) ?? []
        : null,
  }));
}

export type ArticleUtilisateur = {
  parentId: string;
  parentCode: string;
  parentLibelle: string;
  profondeur: number;
};

/**
 * Recherche inverse : où l'article est-il utilisé (directement ou via composé) ?
 */
export async function bomWhereUsed(articleId: string): Promise<ArticleUtilisateur[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx.execute<{
      parent_id: string;
      parent_code: string;
      parent_libelle: string;
      profondeur: number;
    }>(sql`SELECT * FROM bom_where_used(${articleId}::uuid)`),
  );
  return rows.map((r) => ({
    parentId: r.parent_id,
    parentCode: r.parent_code,
    parentLibelle: r.parent_libelle,
    profondeur: r.profondeur,
  }));
}
