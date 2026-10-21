'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhEquipes, sirhPeriodesBloquees, sirhTypesAbsence } from '@/db/schema/test-sirh';
import {
  periodeBloqueeSchema,
  type PeriodeBloqueeInput,
} from '@/lib/validation/test-sirh/absences';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/**
 * Server actions — périodes bloquées (Factorial BlockedPeriod) : aucune
 * demande d'absence du type visé (ou de tout type soumis à validation) ne peut
 * chevaucher la période, pour l'équipe visée (ou toutes). Gestion RH uniquement.
 */

/** Crée (sans `id`) ou met à jour (avec `id`) une période bloquée. */
export async function enregistrerPeriodeBloquee(
  input: PeriodeBloqueeInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = periodeBloqueeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const colonnes = {
    libelle: data.libelle,
    dateDebut: data.dateDebut,
    dateFin: data.dateFin,
    typeAbsenceId: data.typeAbsenceId,
    equipeId: data.equipeId,
    motif: data.motif,
  };

  try {
    const r = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<{ id: string } | { erreur: string; champ?: string }> => {
        if (data.typeAbsenceId) {
          const [type] = await tx
            .select({ id: sirhTypesAbsence.id })
            .from(sirhTypesAbsence)
            .where(
              and(eq(sirhTypesAbsence.id, data.typeAbsenceId), isNull(sirhTypesAbsence.deletedAt)),
            );
          if (!type) return { erreur: 'Type d’absence introuvable.', champ: 'typeAbsenceId' };
        }
        if (data.equipeId) {
          const [equipe] = await tx
            .select({ id: sirhEquipes.id })
            .from(sirhEquipes)
            .where(and(eq(sirhEquipes.id, data.equipeId), isNull(sirhEquipes.deletedAt)));
          if (!equipe) return { erreur: 'Équipe introuvable.', champ: 'equipeId' };
        }

        if (data.id) {
          const [before] = await tx
            .select()
            .from(sirhPeriodesBloquees)
            .where(
              and(eq(sirhPeriodesBloquees.id, data.id), isNull(sirhPeriodesBloquees.deletedAt)),
            );
          if (!before) return { erreur: 'Période bloquée introuvable.' };
          await tx
            .update(sirhPeriodesBloquees)
            .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
            .where(eq(sirhPeriodesBloquees.id, data.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_periodes_bloquees',
            rowId: data.id,
            before,
            after: data,
          });
          return { id: data.id };
        }
        const [inserted] = await tx
          .insert(sirhPeriodesBloquees)
          .values({
            entrepriseId: ctx.entreprise.id,
            ...colonnes,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhPeriodesBloquees.id });
        if (!inserted) throw new Error('INSERT sirh_periodes_bloquees échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_periodes_bloquees',
          rowId: inserted.id,
          after: data,
        });
        return { id: inserted.id };
      },
    );
    if ('erreur' in r) {
      return r.champ
        ? { ok: false, error: r.erreur, fieldErrors: { [r.champ]: [r.erreur] } }
        : { ok: false, error: r.erreur };
    }
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: r };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'La date de fin doit être postérieure ou égale à la date de début.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Suppression (soft-delete) — aucune table ne référence une période bloquée. */
export async function supprimerPeriodeBloquee(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhPeriodesBloquees)
      .where(and(eq(sirhPeriodesBloquees.id, id), isNull(sirhPeriodesBloquees.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhPeriodesBloquees)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhPeriodesBloquees.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_periodes_bloquees',
      rowId: id,
      before,
    });
    return true;
  });
  if (!supprime) return { ok: false, error: 'Période bloquée introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}
