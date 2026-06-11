'use server';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { naturesDocument, type NatureDocument } from '@/db/schema/referentiel-tiers';
import { tierDocuments } from '@/db/schema/tiers-registre';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { ROLES_REFERENTIEL_TIERS_WRITE } from '@/lib/referencement/permissions';
import {
  natureDocumentSchema,
  type NatureDocumentInput,
} from '@/lib/validation/referencement-tiers';

function pathBase(slug: string) {
  return `/${slug}/administration/referentiel-tiers/natures-document`;
}

export async function listerNaturesDocument(): Promise<NatureDocument[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(naturesDocument)
      .where(isNull(naturesDocument.deletedAt))
      .orderBy(asc(naturesDocument.ordreAffichage), asc(naturesDocument.code)),
  );
}

export async function lireNatureDocument(id: string): Promise<NatureDocument | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(naturesDocument)
      .where(and(eq(naturesDocument.id, id), isNull(naturesDocument.deletedAt)))
      .limit(1);
    return row ?? null;
  });
}

export async function creerNatureDocument(
  input: NatureDocumentInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = natureDocumentSchema.safeParse(input);
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
        .insert(naturesDocument)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          modeControle: parsed.data.modeControle,
          delaiValiditeJours: parsed.data.delaiValiditeJours,
          delaiRelanceJours: parsed.data.delaiRelanceJours,
          ordreAffichage: parsed.data.ordreAffichage,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: naturesDocument.id });
      if (!inserted) throw new Error('INSERT failed silently');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'natures_document',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(pathBase(ctx.entreprise.slug));
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

export async function mettreAJourNatureDocument(
  id: string,
  input: NatureDocumentInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = natureDocumentSchema.safeParse(input);
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
        .from(naturesDocument)
        .where(and(eq(naturesDocument.id, id), isNull(naturesDocument.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(naturesDocument)
        .set({
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          modeControle: parsed.data.modeControle,
          delaiValiditeJours: parsed.data.delaiValiditeJours,
          delaiRelanceJours: parsed.data.delaiRelanceJours,
          ordreAffichage: parsed.data.ordreAffichage,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(naturesDocument.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'natures_document',
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
      return { ok: false, error: 'Nature de document introuvable ou supprimée.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

export async function supprimerNatureDocument(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(naturesDocument)
      .where(and(eq(naturesDocument.id, id), isNull(naturesDocument.deletedAt)))
      .limit(1);
    if (!before) return { ok: true, data: undefined };

    const [usage] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tierDocuments)
      .where(and(eq(tierDocuments.natureDocumentId, id), isNull(tierDocuments.deletedAt)));
    const message = messageBlocageSuppression('cette nature de document', [
      {
        nombre: Number(usage?.n ?? 0),
        singulier: 'document de tier',
        pluriel: 'documents de tiers',
      },
    ]);
    if (message) return { ok: false, error: message };

    await tx
      .update(naturesDocument)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(naturesDocument.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'natures_document', rowId: id, before });
    revalidatePath(pathBase(ctx.entreprise.slug));
    return { ok: true, data: undefined };
  });
}
