'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { peutAdministrer, ROLES_ADMINISTRATION } from '@/lib/admin/permissions';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa, type TenantContext } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
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

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type ModeleAvecDefaut = {
  typeDoc: TypeNumeroDoc;
  template: string;
  cadenceReset: CadenceReset;
  /** True si la ligne existe en base, false si on retombe sur le template par défaut. */
  personnalise: boolean;
};

async function requireAdmin(): Promise<TenantContext> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  if (!peutAdministrer(ctx.utilisateur.role)) {
    throw new Error('Accès refusé : section Administration réservée aux administrateurs.');
  }
  return ctx;
}

/**
 * Retourne la liste complète des modèles : ceux explicitement configurés en BD
 * + un défaut pour chaque type non encore configuré. L'UI admin présente toujours
 * la grille complète des types supportés.
 *
 * Pour un type non encore configuré, la cadence par défaut est déduite des
 * tokens du template par défaut (tous contiennent `[@Year]` → 'annee').
 */
export async function listerModelesNumerotation(): Promise<ModeleAvecDefaut[]> {
  const ctx = await requireAdmin();
  const rows = await withTenant(ctx.entreprise.id, async (tx) => {
    return tx
      .select({
        typeDoc: modelesNumerotation.typeDoc,
        template: modelesNumerotation.template,
        cadenceReset: modelesNumerotation.cadenceReset,
      })
      .from(modelesNumerotation);
  });

  const parTypeDb = new Map(rows.map((r) => [r.typeDoc, r]));
  return TYPES_NUMERO_DOC.map((typeDoc) => {
    const dbRow = parTypeDb.get(typeDoc);
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

const modeleInputSchema = z.object({
  typeDoc: z.enum(TYPES_NUMERO_DOC),
  template: z
    .string()
    .trim()
    .min(1, 'Le template ne peut pas être vide.')
    .max(120, 'Le template ne doit pas dépasser 120 caractères.'),
  cadenceReset: z.enum(CADENCES_RESET),
});

export type ModeleInput = z.infer<typeof modeleInputSchema>;

/**
 * Upsert d'un modèle de numérotation pour un type de doc donné. Valide la
 * syntaxe côté serveur (mirror du CHECK Postgres) avant d'écrire.
 */
export async function mettreAJourModeleNumerotation(
  input: ModeleInput,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const parsed = modeleInputSchema.safeParse(input);
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

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [existant] = await tx
      .select({
        id: modelesNumerotation.id,
        template: modelesNumerotation.template,
        cadenceReset: modelesNumerotation.cadenceReset,
      })
      .from(modelesNumerotation)
      .where(
        and(
          eq(modelesNumerotation.entrepriseId, ctx.entreprise.id),
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
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(modelesNumerotation.id, existant.id));
    } else {
      const [inserted] = await tx
        .insert(modelesNumerotation)
        .values({
          entrepriseId: ctx.entreprise.id,
          typeDoc: parsed.data.typeDoc,
          template: parsed.data.template,
          cadenceReset: parsed.data.cadenceReset,
          updatedBy: ctx.utilisateur.id,
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
      },
    });
  });

  revalidatePath(`/${ctx.entreprise.slug}/administration/entreprise`);
  return { ok: true, data: undefined };
}

/**
 * Remet un type de doc à son template par défaut (suppression de la ligne BD).
 * La prochaine génération retombera sur le fallback de `generate_numero`.
 */
export async function reinitialiserModeleNumerotation(
  typeDoc: TypeNumeroDoc,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!TYPES_NUMERO_DOC.includes(typeDoc)) {
    return { ok: false, error: 'Type de document inconnu.' };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [existant] = await tx
      .select({
        id: modelesNumerotation.id,
        template: modelesNumerotation.template,
        cadenceReset: modelesNumerotation.cadenceReset,
      })
      .from(modelesNumerotation)
      .where(
        and(
          eq(modelesNumerotation.entrepriseId, ctx.entreprise.id),
          eq(modelesNumerotation.typeDoc, typeDoc),
        ),
      );
    if (!existant) return;

    await tx.delete(modelesNumerotation).where(eq(modelesNumerotation.id, existant.id));

    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'modeles_numerotation',
      rowId: existant.id,
      before: {
        typeDoc,
        template: existant.template,
        cadenceReset: existant.cadenceReset,
      },
      after: null,
    });
  });

  revalidatePath(`/${ctx.entreprise.slug}/administration/entreprise`);
  return { ok: true, data: undefined };
}
