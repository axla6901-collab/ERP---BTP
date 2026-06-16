'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { flotteEntretiens, flotteVehicules } from '@/db/schema/flotte';
import { entretienSchema, type EntretienInput } from '@/lib/validation/flotte';

import { ROLES_FLOTTE_WRITE } from './permissions';

/** Colonnes scalaires d'un entretien (hors id/véhicule/audit), dérivées de l'input validé. */
function colonnesEntretien(data: EntretienInput) {
  return {
    typeEntretien: data.typeEntretien,
    dateEntretien: data.dateEntretien,
    kilometrage: data.kilometrage,
    description: data.description,
    prestataire: data.prestataire,
    fournisseurId: data.fournisseurId,
    // `cout_ht` est NOT NULL DEFAULT 0 → on ne propage jamais null.
    coutHt: data.coutHt ?? '0',
    coutTva: data.coutTva,
    coutTtc: data.coutTtc,
    prochaineEcheanceKm: data.prochaineEcheanceKm,
    prochaineEcheanceDate: data.prochaineEcheanceDate,
    garantie: data.garantie,
    notes: data.notes,
  };
}

/**
 * Avance le kilométrage du véhicule (et la date de relevé) si le relevé fourni
 * est strictement supérieur — l'odomètre ne recule jamais.
 */
async function avancerKilometrage(
  tx: TenantTx,
  vehiculeId: string,
  kilometrage: number | null,
  dateReleve: string,
  utilisateurId: string,
): Promise<void> {
  if (kilometrage === null) return;
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

/** Crée ou met à jour un entretien (maintenance, réparation) d'un véhicule. */
export async function enregistrerEntretien(
  input: EntretienInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const parsed = entretienSchema.safeParse(input);
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
        .from(flotteEntretiens)
        .where(and(eq(flotteEntretiens.id, data.id), isNull(flotteEntretiens.deletedAt)));
      if (!before) return { type: 'introuvable' as const };
      await tx
        .update(flotteEntretiens)
        .set({ ...colonnesEntretien(data), updatedBy: ctx.utilisateur.id, updatedAt: new Date() })
        .where(eq(flotteEntretiens.id, data.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'flotte_entretiens',
        rowId: data.id,
        before,
        after: data,
      });
      await avancerKilometrage(
        tx,
        data.vehiculeId,
        data.kilometrage,
        data.dateEntretien,
        ctx.utilisateur.id,
      );
      return { type: 'ok' as const, id: data.id };
    }

    const [inserted] = await tx
      .insert(flotteEntretiens)
      .values({
        entrepriseId: ctx.entreprise.id,
        vehiculeId: data.vehiculeId,
        ...colonnesEntretien(data),
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: flotteEntretiens.id });
    if (!inserted) throw new Error('INSERT flotte_entretiens échoué.');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'flotte_entretiens',
      rowId: inserted.id,
      after: data,
    });
    await avancerKilometrage(
      tx,
      data.vehiculeId,
      data.kilometrage,
      data.dateEntretien,
      ctx.utilisateur.id,
    );
    return { type: 'ok' as const, id: inserted.id };
  });

  if (resultat.type === 'introuvable') {
    return { ok: false, error: 'Véhicule ou entretien introuvable.' };
  }
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${data.vehiculeId}`);
  return { ok: true, data: { id: resultat.id } };
}

export async function supprimerEntretien(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(flotteEntretiens)
      .where(and(eq(flotteEntretiens.id, id), isNull(flotteEntretiens.deletedAt)));
    if (!before) return null;
    await tx
      .update(flotteEntretiens)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(flotteEntretiens.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'flotte_entretiens',
      rowId: id,
      before,
    });
    return before;
  });

  if (!supprime) return { ok: false, error: 'Entretien introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${supprime.vehiculeId}`);
  return { ok: true, data: undefined };
}
