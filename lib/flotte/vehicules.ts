'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import {
  flotteAffectations,
  flotteDocuments,
  flotteEcheances,
  flotteEntretiens,
  flottePleins,
  flotteSinistres,
  flotteVehicules,
} from '@/db/schema/flotte';
import { vehiculeSchema, type VehiculeInput } from '@/lib/validation/flotte';

import { ROLES_FLOTTE_WRITE } from './permissions';

/** Colonnes scalaires d'un véhicule (hors id/audit), dérivées de l'input validé. */
function colonnesVehicule(data: VehiculeInput) {
  return {
    immatriculation: data.immatriculation,
    codeInterne: data.codeInterne,
    typeVehicule: data.typeVehicule,
    marque: data.marque,
    modele: data.modele,
    version: data.version,
    vin: data.vin,
    carburant: data.carburant,
    datePremiereImmat: data.datePremiereImmat,
    puissanceFiscale: data.puissanceFiscale,
    critair: data.critair,
    places: data.places,
    ptacKg: data.ptacKg,
    couleur: data.couleur,
    modeDetention: data.modeDetention,
    dateAcquisition: data.dateAcquisition,
    prixAcquisitionHt: data.prixAcquisitionHt,
    valeurResiduelleHt: data.valeurResiduelleHt,
    loyerMensuelHt: data.loyerMensuelHt,
    organismeFinancement: data.organismeFinancement,
    kilometrageActuel: data.kilometrageActuel,
    dateReleveKm: data.dateReleveKm,
    conducteurPrincipalId: data.conducteurPrincipalId,
    statut: data.statut,
    dateSortieParc: data.dateSortieParc,
    prixReventeHt: data.prixReventeHt,
    notes: data.notes,
  };
}

export async function creerVehicule(input: VehiculeInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const parsed = vehiculeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const id = await withTenant(ctx.entreprise.id, async (tx) => {
    const [inserted] = await tx
      .insert(flotteVehicules)
      .values({
        entrepriseId: ctx.entreprise.id,
        ...colonnesVehicule(parsed.data),
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: flotteVehicules.id });
    if (!inserted) throw new Error('INSERT flotte_vehicules échoué.');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'flotte_vehicules',
      rowId: inserted.id,
      after: parsed.data,
    });
    return inserted.id;
  });

  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules`);
  return { ok: true, data: { id } };
}

export async function modifierVehicule(
  input: VehiculeInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const parsed = vehiculeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const id = parsed.data.id;
  if (!id) return { ok: false, error: 'Identifiant manquant.' };

  const updated = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(flotteVehicules)
      .where(and(eq(flotteVehicules.id, id), isNull(flotteVehicules.deletedAt)));
    if (!before) return false;
    await tx
      .update(flotteVehicules)
      .set({
        ...colonnesVehicule(parsed.data),
        updatedBy: ctx.utilisateur.id,
        updatedAt: new Date(),
      })
      .where(eq(flotteVehicules.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'flotte_vehicules',
      rowId: id,
      before,
      after: parsed.data,
    });
    return true;
  });

  if (!updated) return { ok: false, error: 'Véhicule introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${id}`);
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules`);
  return { ok: true, data: { id } };
}

/**
 * Supprime (soft-delete) un véhicule, sauf s'il est référencé (échéances,
 * affectations, entretiens, sinistres, pleins, documents). La sortie de parc
 * doit passer par un changement de statut (vendu/réformé), pas par suppression.
 */
export async function supprimerVehicule(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [vehicule] = await tx
      .select()
      .from(flotteVehicules)
      .where(and(eq(flotteVehicules.id, id), isNull(flotteVehicules.deletedAt)));
    if (!vehicule) return { type: 'introuvable' as const };

    const [ech, aff, ent, sin, ple, doc] = await Promise.all([
      tx
        .select({ n: count() })
        .from(flotteEcheances)
        .where(and(eq(flotteEcheances.vehiculeId, id), isNull(flotteEcheances.deletedAt))),
      tx
        .select({ n: count() })
        .from(flotteAffectations)
        .where(and(eq(flotteAffectations.vehiculeId, id), isNull(flotteAffectations.deletedAt))),
      tx
        .select({ n: count() })
        .from(flotteEntretiens)
        .where(and(eq(flotteEntretiens.vehiculeId, id), isNull(flotteEntretiens.deletedAt))),
      tx
        .select({ n: count() })
        .from(flotteSinistres)
        .where(and(eq(flotteSinistres.vehiculeId, id), isNull(flotteSinistres.deletedAt))),
      tx
        .select({ n: count() })
        .from(flottePleins)
        .where(and(eq(flottePleins.vehiculeId, id), isNull(flottePleins.deletedAt))),
      tx
        .select({ n: count() })
        .from(flotteDocuments)
        .where(and(eq(flotteDocuments.vehiculeId, id), isNull(flotteDocuments.deletedAt))),
    ]);
    const nEch = ech[0]?.n ?? 0;
    const nAff = aff[0]?.n ?? 0;
    const nEnt = ent[0]?.n ?? 0;
    const nSin = sin[0]?.n ?? 0;
    const nPle = ple[0]?.n ?? 0;
    const nDoc = doc[0]?.n ?? 0;

    const blocage = messageBlocageSuppression('ce véhicule', [
      { nombre: nEch, singulier: 'échéance', pluriel: 'échéances' },
      { nombre: nAff, singulier: 'affectation', pluriel: 'affectations' },
      { nombre: nEnt, singulier: 'entretien', pluriel: 'entretiens' },
      { nombre: nSin, singulier: 'sinistre', pluriel: 'sinistres' },
      { nombre: nPle, singulier: 'plein', pluriel: 'pleins' },
      { nombre: nDoc, singulier: 'document', pluriel: 'documents' },
    ]);
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(flotteVehicules)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(flotteVehicules.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'flotte_vehicules',
      rowId: id,
      before: vehicule,
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Véhicule introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };

  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules`);
  return { ok: true, data: undefined };
}
