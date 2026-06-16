'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { flotteEcheances, flotteVehicules } from '@/db/schema/flotte';
import { echeanceSchema, type EcheanceInput } from '@/lib/validation/flotte';

import { ROLES_FLOTTE_WRITE } from './permissions';

function colonnesEcheance(data: EcheanceInput) {
  return {
    typeEcheance: data.typeEcheance,
    libelle: data.libelle,
    dateDebutValidite: data.dateDebutValidite,
    dateEcheance: data.dateEcheance,
    seuilAlerteJours: data.seuilAlerteJours,
    reference: data.reference,
    prestataire: data.prestataire,
    montantHt: data.montantHt,
    notes: data.notes,
  };
}

/** Crée ou met à jour une échéance réglementaire d'un véhicule. */
export async function enregistrerEcheance(
  input: EcheanceInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const parsed = echeanceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    // Le véhicule doit exister dans le tenant (la RLS borne déjà, mais on
    // renvoie une erreur métier propre).
    const [vehicule] = await tx
      .select({ id: flotteVehicules.id })
      .from(flotteVehicules)
      .where(and(eq(flotteVehicules.id, data.vehiculeId), isNull(flotteVehicules.deletedAt)));
    if (!vehicule) return { type: 'introuvable' as const };

    // Cible d'update : l'id fourni, ou l'échéance courante du même type (l'index
    // unique partiel garantit au plus une échéance active par (véhicule, type)).
    const [existante] = data.id
      ? await tx
          .select()
          .from(flotteEcheances)
          .where(and(eq(flotteEcheances.id, data.id), isNull(flotteEcheances.deletedAt)))
      : await tx
          .select()
          .from(flotteEcheances)
          .where(
            and(
              eq(flotteEcheances.vehiculeId, data.vehiculeId),
              eq(flotteEcheances.typeEcheance, data.typeEcheance),
              isNull(flotteEcheances.deletedAt),
            ),
          );

    if (existante) {
      await tx
        .update(flotteEcheances)
        .set({ ...colonnesEcheance(data), updatedBy: ctx.utilisateur.id, updatedAt: new Date() })
        .where(eq(flotteEcheances.id, existante.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'flotte_echeances',
        rowId: existante.id,
        before: existante,
        after: data,
      });
      return { type: 'ok' as const, id: existante.id };
    }

    const [inserted] = await tx
      .insert(flotteEcheances)
      .values({
        entrepriseId: ctx.entreprise.id,
        vehiculeId: data.vehiculeId,
        ...colonnesEcheance(data),
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: flotteEcheances.id });
    if (!inserted) throw new Error('INSERT flotte_echeances échoué.');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'flotte_echeances',
      rowId: inserted.id,
      after: data,
    });
    return { type: 'ok' as const, id: inserted.id };
  });

  if (resultat.type === 'introuvable') {
    return { ok: false, error: 'Véhicule ou échéance introuvable.' };
  }
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${data.vehiculeId}`);
  revalidatePath(`/${ctx.entreprise.slug}/flotte`);
  revalidatePath(`/${ctx.entreprise.slug}/flotte/echeancier`);
  return { ok: true, data: { id: resultat.id } };
}

export async function supprimerEcheance(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(flotteEcheances)
      .where(and(eq(flotteEcheances.id, id), isNull(flotteEcheances.deletedAt)));
    if (!before) return null;
    await tx
      .update(flotteEcheances)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(flotteEcheances.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'flotte_echeances',
      rowId: id,
      before,
    });
    return before;
  });

  if (!supprime) return { ok: false, error: 'Échéance introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${supprime.vehiculeId}`);
  revalidatePath(`/${ctx.entreprise.slug}/flotte`);
  revalidatePath(`/${ctx.entreprise.slug}/flotte/echeancier`);
  return { ok: true, data: undefined };
}
