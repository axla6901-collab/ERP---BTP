'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { auditLogIn } from '@/lib/audit/log';
import { requireSuperAdmin } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { getDbAdmin } from '@/lib/db/client';
import { withTenant } from '@/lib/db/with-tenant';
import { entreprises } from '@/db/schema/entreprises';
import { modelesNumerotation } from '@/db/schema/numerotation';

import {
  CADENCES_RESET,
  cadenceMaxAutoriseePourTemplate,
  parseTemplate,
  TEMPLATES_PAR_DEFAUT,
  TYPES_NUMERO_DOC,
  validerCadence,
  type CadenceReset,
  type TypeNumeroDoc,
} from './template';

export type ModeleNumerotation = {
  typeDoc: TypeNumeroDoc;
  template: string;
  cadenceReset: CadenceReset;
  personnalise: boolean;
};

/**
 * Modèles effectifs (config en BD + défauts) pour une entreprise donnée par
 * son id. Utilisé par la fiche super-admin `/admin/entreprises/[id]` qui fetch
 * en parallèle avec les autres infos entreprise.
 *
 * Passe par `dbAdmin` (BYPASSRLS) — c'est volontairement cross-tenant.
 */
export async function listerModelesNumerotationParEntrepriseId(
  entrepriseId: string,
): Promise<ModeleNumerotation[]> {
  await requireSuperAdmin();
  const db = getDbAdmin();

  const rows = await db
    .select({
      typeDoc: modelesNumerotation.typeDoc,
      template: modelesNumerotation.template,
      cadenceReset: modelesNumerotation.cadenceReset,
    })
    .from(modelesNumerotation)
    .where(eq(modelesNumerotation.entrepriseId, entrepriseId));

  const parType = new Map(rows.map((r) => [r.typeDoc, r]));
  return TYPES_NUMERO_DOC.map((typeDoc) => {
    const dbRow = parType.get(typeDoc);
    if (dbRow) {
      return {
        typeDoc,
        template: dbRow.template,
        cadenceReset: dbRow.cadenceReset as CadenceReset,
        personnalise: true,
      };
    }
    const tpl = TEMPLATES_PAR_DEFAUT[typeDoc];
    return {
      typeDoc,
      template: tpl,
      cadenceReset: cadenceMaxAutoriseePourTemplate(tpl),
      personnalise: false,
    };
  });
}

const modeleSuperInputSchema = z.object({
  entrepriseId: z.string().uuid('Identifiant entreprise invalide.'),
  typeDoc: z.enum(TYPES_NUMERO_DOC),
  template: z
    .string()
    .trim()
    .min(1, 'Le template ne peut pas être vide.')
    .max(120, 'Le template ne doit pas dépasser 120 caractères.'),
  cadenceReset: z.enum(CADENCES_RESET),
});

export type ModeleSuperInput = z.infer<typeof modeleSuperInputSchema>;

/**
 * Upsert super-admin d'un modèle de numérotation pour une entreprise quelconque.
 * Identique à `mettreAJourModeleNumerotation` mais sans la garde tenant : la
 * sécurité repose sur `requireSuperAdmin()` + audit log avec l'id du super-admin.
 */
export async function mettreAJourModeleSuperAdmin(input: ModeleSuperInput): Promise<ActionResult> {
  const superAdmin = await requireSuperAdmin();
  const parsed = modeleSuperInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const validation = parseTemplate(parsed.data.template);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      fieldErrors: { template: [validation.error] },
    };
  }

  const cadenceCheck = validerCadence(parsed.data.template, parsed.data.cadenceReset);
  if (!cadenceCheck.ok) {
    return {
      ok: false,
      error: cadenceCheck.error,
      fieldErrors: { cadenceReset: [cadenceCheck.error] },
    };
  }

  const slug = await withTenant(parsed.data.entrepriseId, async (tx) => {
    const [entreprise] = await tx
      .select({ slug: entreprises.slug })
      .from(entreprises)
      .where(and(eq(entreprises.id, parsed.data.entrepriseId), isNull(entreprises.deletedAt)))
      .limit(1);
    if (!entreprise) throw new Error('NOT_FOUND');

    const [existant] = await tx
      .select({
        id: modelesNumerotation.id,
        template: modelesNumerotation.template,
        cadenceReset: modelesNumerotation.cadenceReset,
      })
      .from(modelesNumerotation)
      .where(
        and(
          eq(modelesNumerotation.entrepriseId, parsed.data.entrepriseId),
          eq(modelesNumerotation.typeDoc, parsed.data.typeDoc),
        ),
      );

    let rowId: string;
    if (existant) {
      rowId = existant.id;
      await tx
        .update(modelesNumerotation)
        .set({
          template: parsed.data.template,
          cadenceReset: parsed.data.cadenceReset,
          updatedAt: new Date(),
          updatedBy: superAdmin.id,
        })
        .where(eq(modelesNumerotation.id, existant.id));
    } else {
      const [inserted] = await tx
        .insert(modelesNumerotation)
        .values({
          entrepriseId: parsed.data.entrepriseId,
          typeDoc: parsed.data.typeDoc,
          template: parsed.data.template,
          cadenceReset: parsed.data.cadenceReset,
          updatedBy: superAdmin.id,
        })
        .returning({ id: modelesNumerotation.id });
      if (!inserted) throw new Error('INSERT modeles_numerotation failed');
      rowId = inserted.id;
    }

    await auditLogIn(tx, {
      action: existant ? 'update' : 'insert',
      tableName: 'modeles_numerotation',
      rowId,
      before: existant
        ? {
            typeDoc: parsed.data.typeDoc,
            template: existant.template,
            cadenceReset: existant.cadenceReset,
          }
        : null,
      after: {
        typeDoc: parsed.data.typeDoc,
        template: parsed.data.template,
        cadenceReset: parsed.data.cadenceReset,
        viaSuperAdmin: true,
      },
      utilisateurId: superAdmin.id,
    });

    return entreprise.slug;
  }).catch((err: unknown) => {
    if (err instanceof Error && err.message === 'NOT_FOUND') return null;
    throw err;
  });

  if (slug === null) {
    return { ok: false, error: 'Entreprise introuvable.' };
  }

  revalidatePath(`/admin/entreprises/${parsed.data.entrepriseId}`);
  return { ok: true, data: undefined };
}

const reinitInputSchema = z.object({
  entrepriseId: z.string().uuid('Identifiant entreprise invalide.'),
  typeDoc: z.enum(TYPES_NUMERO_DOC),
});

export type ReinitSuperInput = z.infer<typeof reinitInputSchema>;

/**
 * Réinitialise un modèle au défaut (suppression de la ligne BD) pour une
 * entreprise donnée. Action super-admin.
 */
export async function reinitialiserModeleSuperAdmin(
  input: ReinitSuperInput,
): Promise<ActionResult> {
  const superAdmin = await requireSuperAdmin();
  const parsed = reinitInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const slug = await withTenant(parsed.data.entrepriseId, async (tx) => {
    const [entreprise] = await tx
      .select({ slug: entreprises.slug })
      .from(entreprises)
      .where(and(eq(entreprises.id, parsed.data.entrepriseId), isNull(entreprises.deletedAt)))
      .limit(1);
    if (!entreprise) throw new Error('NOT_FOUND');

    const [existant] = await tx
      .select({
        id: modelesNumerotation.id,
        template: modelesNumerotation.template,
        cadenceReset: modelesNumerotation.cadenceReset,
      })
      .from(modelesNumerotation)
      .where(
        and(
          eq(modelesNumerotation.entrepriseId, parsed.data.entrepriseId),
          eq(modelesNumerotation.typeDoc, parsed.data.typeDoc),
        ),
      );
    if (!existant) return entreprise.slug;

    await tx.delete(modelesNumerotation).where(eq(modelesNumerotation.id, existant.id));

    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'modeles_numerotation',
      rowId: existant.id,
      before: {
        typeDoc: parsed.data.typeDoc,
        template: existant.template,
        cadenceReset: existant.cadenceReset,
      },
      after: { viaSuperAdmin: true },
      utilisateurId: superAdmin.id,
    });

    return entreprise.slug;
  }).catch((err: unknown) => {
    if (err instanceof Error && err.message === 'NOT_FOUND') return null;
    throw err;
  });

  if (slug === null) {
    return { ok: false, error: 'Entreprise introuvable.' };
  }

  revalidatePath(`/admin/entreprises/${parsed.data.entrepriseId}`);
  return { ok: true, data: undefined };
}
