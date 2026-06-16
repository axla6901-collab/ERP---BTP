'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { flottePleins, flotteVehicules } from '@/db/schema/flotte';
import { pleinSchema, type PleinInput } from '@/lib/validation/flotte';

import { ROLES_FLOTTE_WRITE } from './permissions';

/**
 * Colonnes scalaires d'un plein (hors id/véhicule/audit). Le numéro de carte
 * carburant est chiffré de manière transparente par la colonne `encryptedText` ;
 * il est par ailleurs caviardé dans l'audit (`CHAMPS_SENSIBLES_PAR_TABLE`).
 */
function colonnesPlein(data: PleinInput) {
  return {
    employeId: data.employeId,
    datePlein: data.datePlein,
    kilometrage: data.kilometrage,
    volumeLitres: data.volumeLitres,
    energieKwh: data.energieKwh,
    // `prix_ht` est NOT NULL DEFAULT 0 → on ne propage jamais null.
    prixHt: data.prixHt ?? '0',
    prixTtc: data.prixTtc,
    pleinComplet: data.pleinComplet,
    station: data.station,
    numeroCarteCarburant: data.numeroCarteCarburant,
    notes: data.notes,
  };
}

/** Avance l'odomètre du véhicule si le relevé du plein est strictement supérieur. */
async function avancerKilometrage(
  tx: TenantTx,
  vehiculeId: string,
  kilometrage: number,
  dateReleve: string,
  utilisateurId: string,
): Promise<void> {
  await tx
    .update(flotteVehicules)
    .set({ kilometrageActuel: kilometrage, dateReleveKm: dateReleve, updatedBy: utilisateurId })
    .where(
      and(
        eq(flotteVehicules.id, vehiculeId),
        sql`${flotteVehicules.kilometrageActuel} < ${kilometrage}`,
      ),
    );
}

/** Crée ou met à jour un plein de carburant / une recharge d'un véhicule. */
export async function enregistrerPlein(input: PleinInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const parsed = pleinSchema.safeParse(input);
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

    let id: string;
    if (data.id) {
      const [before] = await tx
        .select({ id: flottePleins.id })
        .from(flottePleins)
        .where(and(eq(flottePleins.id, data.id), isNull(flottePleins.deletedAt)));
      if (!before) return { type: 'introuvable' as const };
      await tx
        .update(flottePleins)
        .set({ ...colonnesPlein(data), updatedBy: ctx.utilisateur.id, updatedAt: new Date() })
        .where(eq(flottePleins.id, data.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'flotte_pleins',
        rowId: data.id,
        after: data,
      });
      id = data.id;
    } else {
      const [inserted] = await tx
        .insert(flottePleins)
        .values({
          entrepriseId: ctx.entreprise.id,
          vehiculeId: data.vehiculeId,
          ...colonnesPlein(data),
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: flottePleins.id });
      if (!inserted) throw new Error('INSERT flotte_pleins échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'flotte_pleins',
        rowId: inserted.id,
        after: data,
      });
      id = inserted.id;
    }

    await avancerKilometrage(
      tx,
      data.vehiculeId,
      data.kilometrage,
      data.datePlein,
      ctx.utilisateur.id,
    );
    return { type: 'ok' as const, id };
  });

  if (resultat.type === 'introuvable') {
    return { ok: false, error: 'Véhicule ou plein introuvable.' };
  }
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${data.vehiculeId}`);
  return { ok: true, data: { id: resultat.id } };
}

export async function supprimerPlein(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select({ id: flottePleins.id, vehiculeId: flottePleins.vehiculeId })
      .from(flottePleins)
      .where(and(eq(flottePleins.id, id), isNull(flottePleins.deletedAt)));
    if (!before) return null;
    await tx
      .update(flottePleins)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(flottePleins.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'flotte_pleins',
      rowId: id,
    });
    return before;
  });

  if (!supprime) return { ok: false, error: 'Plein introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${supprime.vehiculeId}`);
  return { ok: true, data: undefined };
}
