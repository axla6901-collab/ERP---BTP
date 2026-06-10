'use server';

import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import {
  societes,
  societesRegles,
  type Societe,
  type SocieteRegle,
} from '@/db/schema/societes';
import { tierSocietesAutorisees } from '@/db/schema/tiers-registre';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { ROLES_REFERENTIEL_TIERS_WRITE } from '@/lib/referencement/permissions';
import {
  societeRegleSchema,
  societeSchema,
  type SocieteRegleInput,
  type SocieteInput,
} from '@/lib/validation/referencement-tiers';

function pathBase(slug: string) {
  return `/${slug}/administration/referentiel-tiers/societes`;
}

export async function listerSocietes(): Promise<Societe[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx.select().from(societes).where(isNull(societes.deletedAt)).orderBy(asc(societes.code)),
  );
}

export async function lireSociete(
  id: string,
): Promise<{ societe: Societe; regles: SocieteRegle[] } | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [societe] = await tx
      .select()
      .from(societes)
      .where(and(eq(societes.id, id), isNull(societes.deletedAt)))
      .limit(1);
    if (!societe) return null;
    const regles = await tx
      .select()
      .from(societesRegles)
      .where(eq(societesRegles.societeId, id))
      .orderBy(asc(societesRegles.codeRegle));
    return { societe, regles };
  });
}

export async function creerSociete(input: SocieteInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = societeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(societes)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          raisonSociale: parsed.data.raisonSociale,
          siret: parsed.data.siret,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: societes.id });
      if (!inserted) throw new Error('INSERT failed silently');
      await auditLogIn(tx, { action: 'insert', tableName: 'societes', rowId: inserted.id, after: parsed.data });
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

export async function mettreAJourSociete(id: string, input: SocieteInput): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = societeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(societes)
        .where(and(eq(societes.id, id), isNull(societes.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(societes)
        .set({
          code: parsed.data.code,
          raisonSociale: parsed.data.raisonSociale,
          siret: parsed.data.siret,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(societes.id, id));
      await auditLogIn(tx, { action: 'update', tableName: 'societes', rowId: id, before, after: parsed.data });
    });
    revalidatePath(pathBase(ctx.entreprise.slug));
    revalidatePath(`${pathBase(ctx.entreprise.slug)}/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Société introuvable ou supprimée.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

export async function supprimerSociete(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(societes)
      .where(and(eq(societes.id, id), isNull(societes.deletedAt)))
      .limit(1);
    if (!before) return { ok: true, data: undefined };

    const [usage] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tierSocietesAutorisees)
      .where(eq(tierSocietesAutorisees.societeId, id));
    const message = messageBlocageSuppression('cette société', [
      { nombre: Number(usage?.n ?? 0), singulier: 'tier autorisé', pluriel: 'tiers autorisés' },
    ]);
    if (message) return { ok: false, error: message };

    await tx
      .update(societes)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(societes.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'societes', rowId: id, before });
    revalidatePath(pathBase(ctx.entreprise.slug));
    return { ok: true, data: undefined };
  });
}

// ─────────────────────────────────────────────────────────────
// Règles applicables à une société (Table 2 du docx)
// ─────────────────────────────────────────────────────────────

export async function ajouterRegleSociete(
  societeId: string,
  input: SocieteRegleInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  const parsed = societeRegleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(societesRegles)
        .values({
          entrepriseId: ctx.entreprise.id,
          societeId,
          codeRegle: parsed.data.codeRegle,
          libelle: parsed.data.libelle,
          applique: parsed.data.applique,
          description: parsed.data.description,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: societesRegles.id });
      if (!inserted) throw new Error('INSERT failed silently');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'societes_regles',
        rowId: inserted.id,
        after: { societeId, ...parsed.data },
      });
      return inserted.id;
    });
    revalidatePath(`${pathBase(ctx.entreprise.slug)}/${societeId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `La règle "${parsed.data.codeRegle}" existe déjà pour cette société.` };
    }
    throw err;
  }
}

export async function basculerRegleSociete(
  regleId: string,
  applique: boolean,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(societesRegles)
      .where(eq(societesRegles.id, regleId))
      .limit(1);
    if (!before) return { ok: false, error: 'Règle introuvable.' };
    await tx
      .update(societesRegles)
      .set({ applique, updatedBy: ctx.utilisateur.id })
      .where(eq(societesRegles.id, regleId));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'societes_regles',
      rowId: regleId,
      before,
      after: { applique },
    });
    revalidatePath(`${pathBase(ctx.entreprise.slug)}/${before.societeId}`);
    return { ok: true, data: undefined };
  });
}

export async function supprimerRegleSociete(regleId: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(societesRegles)
      .where(eq(societesRegles.id, regleId))
      .limit(1);
    if (!before) return { ok: true, data: undefined };
    await tx.delete(societesRegles).where(eq(societesRegles.id, regleId));
    await auditLogIn(tx, { action: 'delete', tableName: 'societes_regles', rowId: regleId, before });
    revalidatePath(`${pathBase(ctx.entreprise.slug)}/${before.societeId}`);
    return { ok: true, data: undefined };
  });
}
