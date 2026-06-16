'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { employePermis } from '@/db/schema/employes';
import { flotteAffectations, flotteVehicules } from '@/db/schema/flotte';
import { affectationSchema, type AffectationInput } from '@/lib/validation/flotte';

import { controlePermisConducteur } from './echeances';
import { ROLES_FLOTTE_AFFECTATION_WRITE } from './permissions';

function aujourdhuiIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Crée une affectation véhicule → conducteur et/ou chantier. Si elle est « en
 * cours », clôture automatiquement l'affectation en cours précédente du véhicule
 * et met à jour le conducteur principal. Le contrôle du permis du conducteur est
 * non bloquant : un avertissement est retourné le cas échéant.
 */
export async function creerAffectation(
  input: AffectationInput,
): Promise<ActionResult<{ id: string; avertissement: string | null }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_AFFECTATION_WRITE);
  const parsed = affectationSchema.safeParse(input);
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
      .select({
        id: flotteVehicules.id,
        typeVehicule: flotteVehicules.typeVehicule,
      })
      .from(flotteVehicules)
      .where(and(eq(flotteVehicules.id, data.vehiculeId), isNull(flotteVehicules.deletedAt)));
    if (!vehicule) return { type: 'introuvable' as const };

    // Contrôle du permis du conducteur (non bloquant).
    let avertissement: string | null = null;
    if (data.employeId) {
      const permis = await tx
        .select({ categorie: employePermis.categorie, dateValidite: employePermis.dateValidite })
        .from(employePermis)
        .where(and(eq(employePermis.employeId, data.employeId), isNull(employePermis.deletedAt)));
      avertissement = controlePermisConducteur(
        vehicule.typeVehicule,
        permis,
        aujourdhuiIso(),
      ).message;
    }

    // Une seule affectation « en cours » par véhicule : clôture la précédente.
    if (data.statut === 'en_cours') {
      await tx
        .update(flotteAffectations)
        .set({ statut: 'terminee', dateFin: aujourdhuiIso(), updatedBy: ctx.utilisateur.id })
        .where(
          and(
            eq(flotteAffectations.vehiculeId, data.vehiculeId),
            eq(flotteAffectations.statut, 'en_cours'),
            isNull(flotteAffectations.deletedAt),
          ),
        );
      await tx
        .update(flotteVehicules)
        .set({ conducteurPrincipalId: data.employeId, updatedBy: ctx.utilisateur.id })
        .where(eq(flotteVehicules.id, data.vehiculeId));
    }

    const [inserted] = await tx
      .insert(flotteAffectations)
      .values({
        entrepriseId: ctx.entreprise.id,
        vehiculeId: data.vehiculeId,
        employeId: data.employeId,
        chantierId: data.chantierId,
        statut: data.statut,
        dateDebut: data.dateDebut,
        dateFin: data.dateFin,
        kmDebut: data.kmDebut,
        kmFin: data.kmFin,
        motif: data.motif,
        notes: data.notes,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: flotteAffectations.id });
    if (!inserted) throw new Error('INSERT flotte_affectations échoué.');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'flotte_affectations',
      rowId: inserted.id,
      after: data,
    });
    return { type: 'ok' as const, id: inserted.id, avertissement };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Véhicule introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${data.vehiculeId}`);
  return { ok: true, data: { id: resultat.id, avertissement: resultat.avertissement } };
}

/** Clôture une affectation en cours (statut → terminée + date de fin). */
export async function terminerAffectation(id: string, dateFin?: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_AFFECTATION_WRITE);
  const fin = dateFin && /^\d{4}-\d{2}-\d{2}$/.test(dateFin) ? dateFin : aujourdhuiIso();

  const affectation = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(flotteAffectations)
      .where(and(eq(flotteAffectations.id, id), isNull(flotteAffectations.deletedAt)));
    if (!before) return null;
    await tx
      .update(flotteAffectations)
      .set({ statut: 'terminee', dateFin: fin, updatedBy: ctx.utilisateur.id })
      .where(eq(flotteAffectations.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'flotte_affectations',
      rowId: id,
      before,
      after: { statut: 'terminee', dateFin: fin },
    });
    return before;
  });

  if (!affectation) return { ok: false, error: 'Affectation introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${affectation.vehiculeId}`);
  return { ok: true, data: undefined };
}

export async function supprimerAffectation(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_AFFECTATION_WRITE);
  const affectation = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(flotteAffectations)
      .where(and(eq(flotteAffectations.id, id), isNull(flotteAffectations.deletedAt)));
    if (!before) return null;
    await tx
      .update(flotteAffectations)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(flotteAffectations.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'flotte_affectations',
      rowId: id,
      before,
    });
    return before;
  });

  if (!affectation) return { ok: false, error: 'Affectation introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${affectation.vehiculeId}`);
  return { ok: true, data: undefined };
}
