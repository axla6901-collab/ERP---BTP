'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { flotteSinistres, flotteVehicules } from '@/db/schema/flotte';
import { sinistreSchema, type SinistreInput } from '@/lib/validation/flotte';

import { ROLES_FLOTTE_WRITE } from './permissions';

function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Colonnes scalaires d'un sinistre (hors id/véhicule/audit), dérivées de l'input validé. */
function colonnesSinistre(data: SinistreInput) {
  // Un sinistre clos sans date de clôture explicite est daté du jour.
  const dateCloture = data.clos ? (data.dateCloture ?? aujourdhuiIso()) : null;
  return {
    employeId: data.employeId,
    numeroSinistre: data.numeroSinistre,
    dateSinistre: data.dateSinistre,
    lieu: data.lieu,
    description: data.description,
    responsabilite: data.responsabilite,
    tiersImplique: data.tiersImplique,
    montantDommagesHt: data.montantDommagesHt,
    franchiseHt: data.franchiseHt,
    indemnisationHt: data.indemnisationHt,
    clos: data.clos,
    dateCloture,
    notes: data.notes,
  };
}

/** Crée ou met à jour un sinistre (accident, bris, vol partiel…) d'un véhicule. */
export async function enregistrerSinistre(
  input: SinistreInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const parsed = sinistreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [vehicule] = await tx
      .select({ id: flotteVehicules.id })
      .from(flotteVehicules)
      .where(and(eq(flotteVehicules.id, data.vehiculeId), isNull(flotteVehicules.deletedAt)));
    if (!vehicule) return { type: 'introuvable' as const };

    if (data.id) {
      const [before] = await tx
        .select()
        .from(flotteSinistres)
        .where(and(eq(flotteSinistres.id, data.id), isNull(flotteSinistres.deletedAt)));
      if (!before) return { type: 'introuvable' as const };
      await tx
        .update(flotteSinistres)
        .set({ ...colonnesSinistre(data), updatedBy: ctx.utilisateur.id, updatedAt: new Date() })
        .where(eq(flotteSinistres.id, data.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'flotte_sinistres',
        rowId: data.id,
        before,
        after: data,
      });
      return { type: 'ok' as const, id: data.id };
    }

    const [inserted] = await tx
      .insert(flotteSinistres)
      .values({
        entrepriseId: ctx.entreprise.id,
        vehiculeId: data.vehiculeId,
        ...colonnesSinistre(data),
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: flotteSinistres.id });
    if (!inserted) throw new Error('INSERT flotte_sinistres échoué.');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'flotte_sinistres',
      rowId: inserted.id,
      after: data,
    });
    return { type: 'ok' as const, id: inserted.id };
  });

  if (resultat.type === 'introuvable') {
    return { ok: false, error: 'Véhicule ou sinistre introuvable.' };
  }
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${data.vehiculeId}`);
  revalidatePath(`/${ctx.entreprise.slug}/flotte`);
  return { ok: true, data: { id: resultat.id } };
}

/** Clôture un sinistre (clos = true + date de clôture, par défaut aujourd'hui). */
export async function cloturerSinistre(id: string, dateCloture?: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const date =
    dateCloture && /^\d{4}-\d{2}-\d{2}$/.test(dateCloture) ? dateCloture : aujourdhuiIso();

  const sinistre = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(flotteSinistres)
      .where(and(eq(flotteSinistres.id, id), isNull(flotteSinistres.deletedAt)));
    if (!before) return null;
    await tx
      .update(flotteSinistres)
      .set({ clos: true, dateCloture: date, updatedBy: ctx.utilisateur.id })
      .where(eq(flotteSinistres.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'flotte_sinistres',
      rowId: id,
      before,
      after: { clos: true, dateCloture: date },
    });
    return before;
  });

  if (!sinistre) return { ok: false, error: 'Sinistre introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${sinistre.vehiculeId}`);
  revalidatePath(`/${ctx.entreprise.slug}/flotte`);
  return { ok: true, data: undefined };
}

export async function supprimerSinistre(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(flotteSinistres)
      .where(and(eq(flotteSinistres.id, id), isNull(flotteSinistres.deletedAt)));
    if (!before) return null;
    await tx
      .update(flotteSinistres)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(flotteSinistres.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'flotte_sinistres',
      rowId: id,
      before,
    });
    return before;
  });

  if (!supprime) return { ok: false, error: 'Sinistre introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${supprime.vehiculeId}`);
  revalidatePath(`/${ctx.entreprise.slug}/flotte`);
  return { ok: true, data: undefined };
}
