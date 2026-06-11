'use server';

import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import {
  articles,
  fournisseurs,
  grilleTarifaireLignes,
  grillesTarifaires,
  unites,
  type GrilleTarifaire,
  type GrilleTarifaireLigne,
} from '@/db/schema/catalogue';
import { chantiers } from '@/db/schema/chantiers';
import { grilleTarifaireSchema, type GrilleTarifaireInput } from '@/lib/validation/catalogue';

import { ROLES_CATALOGUE_WRITE } from './permissions';
import type { ActionResult } from './types';

export type GrilleResume = GrilleTarifaire & {
  nbLignes: number;
  chantierNumero: string | null;
  chantierLibelle: string | null;
};

export type GrilleLigneHydrate = GrilleTarifaireLigne & {
  articleCode: string;
  articleLibelle: string;
  uniteSymbole: string | null;
};

export type GrilleDetail = GrilleTarifaire & {
  fournisseurNom: string;
  fournisseurCode: string;
  chantierNumero: string | null;
  chantierLibelle: string | null;
  lignes: GrilleLigneHydrate[];
};

export type GrilleResumeChantier = GrilleTarifaire & {
  nbLignes: number;
  fournisseurCode: string;
  fournisseurNom: string;
};

// ─────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────

export async function listerGrillesFournisseur(fournisseurId: string): Promise<GrilleResume[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const grilles = await tx
      .select({
        grille: grillesTarifaires,
        chantierNumero: chantiers.numero,
        chantierLibelle: chantiers.libelle,
      })
      .from(grillesTarifaires)
      .leftJoin(chantiers, eq(grillesTarifaires.chantierId, chantiers.id))
      .where(
        and(
          eq(grillesTarifaires.fournisseurId, fournisseurId),
          isNull(grillesTarifaires.deletedAt),
        ),
      )
      .orderBy(desc(grillesTarifaires.validFrom));

    if (grilles.length === 0) return [];

    const counts = new Map<string, number>();
    const ids = grilles.map((r) => r.grille.id);
    const rows = await tx
      .select({ grilleId: grilleTarifaireLignes.grilleId })
      .from(grilleTarifaireLignes)
      .where(inArray(grilleTarifaireLignes.grilleId, ids));
    for (const r of rows) {
      counts.set(r.grilleId, (counts.get(r.grilleId) ?? 0) + 1);
    }

    return grilles.map((r) => ({
      ...r.grille,
      nbLignes: counts.get(r.grille.id) ?? 0,
      chantierNumero: r.chantierNumero ?? null,
      chantierLibelle: r.chantierLibelle ?? null,
    }));
  });
}

export async function listerGrillesChantier(chantierId: string): Promise<GrilleResumeChantier[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const grilles = await tx
      .select({
        grille: grillesTarifaires,
        fournisseurCode: fournisseurs.code,
        fournisseurNom: fournisseurs.nom,
      })
      .from(grillesTarifaires)
      .innerJoin(fournisseurs, eq(grillesTarifaires.fournisseurId, fournisseurs.id))
      .where(and(eq(grillesTarifaires.chantierId, chantierId), isNull(grillesTarifaires.deletedAt)))
      .orderBy(desc(grillesTarifaires.validFrom));

    if (grilles.length === 0) return [];

    const counts = new Map<string, number>();
    const ids = grilles.map((r) => r.grille.id);
    const rows = await tx
      .select({ grilleId: grilleTarifaireLignes.grilleId })
      .from(grilleTarifaireLignes)
      .where(inArray(grilleTarifaireLignes.grilleId, ids));
    for (const r of rows) {
      counts.set(r.grilleId, (counts.get(r.grilleId) ?? 0) + 1);
    }

    return grilles.map((r) => ({
      ...r.grille,
      nbLignes: counts.get(r.grille.id) ?? 0,
      fournisseurCode: r.fournisseurCode,
      fournisseurNom: r.fournisseurNom,
    }));
  });
}

export async function lireGrille(id: string): Promise<GrilleDetail | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [grille] = await tx
      .select({
        grille: grillesTarifaires,
        fournisseurNom: fournisseurs.nom,
        fournisseurCode: fournisseurs.code,
        chantierNumero: chantiers.numero,
        chantierLibelle: chantiers.libelle,
      })
      .from(grillesTarifaires)
      .innerJoin(fournisseurs, eq(grillesTarifaires.fournisseurId, fournisseurs.id))
      .leftJoin(chantiers, eq(grillesTarifaires.chantierId, chantiers.id))
      .where(and(eq(grillesTarifaires.id, id), isNull(grillesTarifaires.deletedAt)))
      .limit(1);
    if (!grille) return null;

    const lignes = await tx
      .select({
        ligne: grilleTarifaireLignes,
        articleCode: articles.code,
        articleLibelle: articles.libelle,
        uniteSymbole: unites.symbole,
      })
      .from(grilleTarifaireLignes)
      .innerJoin(articles, eq(grilleTarifaireLignes.articleId, articles.id))
      .leftJoin(unites, eq(grilleTarifaireLignes.uniteId, unites.id))
      .where(eq(grilleTarifaireLignes.grilleId, id))
      .orderBy(asc(articles.code));

    return {
      ...grille.grille,
      fournisseurNom: grille.fournisseurNom,
      fournisseurCode: grille.fournisseurCode,
      chantierNumero: grille.chantierNumero ?? null,
      chantierLibelle: grille.chantierLibelle ?? null,
      lignes: lignes.map((r) => ({
        ...r.ligne,
        articleCode: r.articleCode,
        articleLibelle: r.articleLibelle,
        uniteSymbole: r.uniteSymbole ?? null,
      })),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Écriture
// ─────────────────────────────────────────────────────────────

export async function creerGrille(
  fournisseurId: string,
  input: GrilleTarifaireInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  const parsed = grilleTarifaireSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      // Vérifier que le fournisseur existe et est actif (dans la même
      // transaction tenant pour bénéficier de la RLS).
      const [fournisseur] = await tx
        .select()
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, fournisseurId), isNull(fournisseurs.deletedAt)))
        .limit(1);
      if (!fournisseur) {
        throw new Error('FOURNISSEUR_NOT_FOUND');
      }

      const [inserted] = await tx
        .insert(grillesTarifaires)
        .values({
          entrepriseId: ctx.entreprise.id,
          fournisseurId,
          chantierId: parsed.data.chantierId,
          libelle: parsed.data.libelle,
          validFrom: parsed.data.validFrom,
          validTo: parsed.data.validTo,
          actif: parsed.data.actif,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: grillesTarifaires.id });
      if (!inserted) throw new Error('INSERT grille failed');

      if (parsed.data.lignes.length > 0) {
        await tx.insert(grilleTarifaireLignes).values(
          parsed.data.lignes.map((l) => ({
            entrepriseId: ctx.entreprise.id,
            grilleId: inserted.id,
            articleId: l.articleId,
            prixUnitaireHt: l.prixUnitaireHt,
            uniteId: l.uniteId,
            referenceFournisseur: l.referenceFournisseur,
            quantiteMin: l.quantiteMin,
            notes: l.notes,
          })),
        );
      }

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'grilles_tarifaires',
        rowId: inserted.id,
        after: parsed.data,
      });

      return inserted.id;
    });

    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}/grilles`);
    if (parsed.data.chantierId) {
      revalidatePath(`/${ctx.entreprise.slug}/chantiers/${parsed.data.chantierId}`);
    }
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && err.message === 'FOURNISSEUR_NOT_FOUND') {
      return { ok: false, error: 'Fournisseur introuvable.' };
    }
    if (err instanceof Error && /uq_grille_lignes_grille_article/i.test(err.message)) {
      return { ok: false, error: 'Un article apparaît plusieurs fois dans la grille.' };
    }
    throw err;
  }
}

export async function mettreAJourGrille(
  id: string,
  input: GrilleTarifaireInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  const parsed = grilleTarifaireSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const { fournisseurId, chantierId } = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(grillesTarifaires)
        .where(and(eq(grillesTarifaires.id, id), isNull(grillesTarifaires.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(grillesTarifaires)
        .set({
          chantierId: parsed.data.chantierId,
          libelle: parsed.data.libelle,
          validFrom: parsed.data.validFrom,
          validTo: parsed.data.validTo,
          actif: parsed.data.actif,
          notes: parsed.data.notes,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(grillesTarifaires.id, id));

      // Remplacement complet des lignes : approche simple, sûre, et qui évite
      // de devoir gérer un diff côté UI. Vu le volume (quelques dizaines à
      // quelques centaines de lignes par grille), c'est acceptable.
      await tx.delete(grilleTarifaireLignes).where(eq(grilleTarifaireLignes.grilleId, id));
      await tx.insert(grilleTarifaireLignes).values(
        parsed.data.lignes.map((l) => ({
          entrepriseId: ctx.entreprise.id,
          grilleId: id,
          articleId: l.articleId,
          prixUnitaireHt: l.prixUnitaireHt,
          uniteId: l.uniteId,
          referenceFournisseur: l.referenceFournisseur,
          quantiteMin: l.quantiteMin,
          notes: l.notes,
        })),
      );

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'grilles_tarifaires',
        rowId: id,
        before,
        after: parsed.data,
      });

      return {
        fournisseurId: before.fournisseurId,
        chantierId: parsed.data.chantierId ?? before.chantierId,
      };
    });

    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}/grilles`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}/grilles/${id}`);
    if (chantierId) {
      revalidatePath(`/${ctx.entreprise.slug}/chantiers/${chantierId}`);
    }
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Grille introuvable.' };
    }
    if (err instanceof Error && /uq_grille_lignes_grille_article/i.test(err.message)) {
      return { ok: false, error: 'Un article apparaît plusieurs fois dans la grille.' };
    }
    throw err;
  }
}

export async function supprimerGrille(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  let fournisseurId: string | undefined;
  let chantierId: string | null = null;
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(grillesTarifaires)
      .where(and(eq(grillesTarifaires.id, id), isNull(grillesTarifaires.deletedAt)));
    if (!before) return;
    fournisseurId = before.fournisseurId;
    chantierId = before.chantierId;
    await tx
      .update(grillesTarifaires)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(grillesTarifaires.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'grilles_tarifaires',
      rowId: id,
      before,
    });
  });
  if (fournisseurId) {
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}/grilles`);
  }
  if (chantierId) {
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${chantierId}`);
  }
  return { ok: true, data: undefined };
}

/**
 * Duplique une grille pour préparer la version suivante. Les lignes sont
 * recopiées à l'identique ; l'utilisateur ajuste ensuite les prix.
 */
export async function dupliquerGrille(
  id: string,
  nouvelles: { libelle: string; validFrom: string; validTo: string | null },
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
  try {
    const { newId, fournisseurId } = await withTenant(ctx.entreprise.id, async (tx) => {
      const [source] = await tx
        .select()
        .from(grillesTarifaires)
        .where(and(eq(grillesTarifaires.id, id), isNull(grillesTarifaires.deletedAt)));
      if (!source) throw new Error('NOT_FOUND');

      const sourceLignes = await tx
        .select()
        .from(grilleTarifaireLignes)
        .where(eq(grilleTarifaireLignes.grilleId, id));

      const [inserted] = await tx
        .insert(grillesTarifaires)
        .values({
          entrepriseId: ctx.entreprise.id,
          fournisseurId: source.fournisseurId,
          chantierId: source.chantierId,
          libelle: nouvelles.libelle,
          validFrom: nouvelles.validFrom,
          validTo: nouvelles.validTo,
          actif: true,
          notes: source.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: grillesTarifaires.id });
      if (!inserted) throw new Error('INSERT failed');

      if (sourceLignes.length > 0) {
        await tx.insert(grilleTarifaireLignes).values(
          sourceLignes.map((l) => ({
            entrepriseId: ctx.entreprise.id,
            grilleId: inserted.id,
            articleId: l.articleId,
            prixUnitaireHt: l.prixUnitaireHt,
            uniteId: l.uniteId,
            referenceFournisseur: l.referenceFournisseur,
            quantiteMin: l.quantiteMin,
            notes: l.notes,
          })),
        );
      }

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'grilles_tarifaires',
        rowId: inserted.id,
        after: { ...nouvelles, fournisseurId: source.fournisseurId, dupliqueDe: id },
      });

      return { newId: inserted.id, fournisseurId: source.fournisseurId };
    });

    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${fournisseurId}/grilles`);
    return { ok: true, data: { id: newId } };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Grille source introuvable.' };
    }
    throw err;
  }
}
