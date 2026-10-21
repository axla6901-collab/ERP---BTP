'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import {
  sirhAbsences,
  sirhCompteurs,
  sirhPeriodesBloquees,
  sirhTypesAbsence,
} from '@/db/schema/test-sirh';
import { typeAbsenceSchema, type TypeAbsenceInput } from '@/lib/validation/test-sirh/absences';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/** Server actions — types d'absence (Factorial LeaveType). Gestion RH uniquement. */

function colonnesType(data: TypeAbsenceInput) {
  return {
    code: data.code,
    libelle: data.libelle,
    categorie: data.categorie,
    uniteDecompte: data.uniteDecompte,
    avecSolde: data.avecSolde,
    necessiteValidation: data.necessiteValidation,
    justificatifRequis: data.justificatifRequis,
    remuneree: data.remuneree,
    couleur: data.couleur,
    codeRubriquePaie: data.codeRubriquePaie,
    actif: data.actif,
    ordre: data.ordre,
  };
}

/**
 * Crée (sans `id`) ou met à jour (avec `id`) un type d'absence. L'unité de
 * décompte ne peut plus changer une fois des absences saisies (leurs durées
 * enregistrées deviendraient incohérentes).
 */
export async function enregistrerTypeAbsence(
  input: TypeAbsenceInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = typeAbsenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const r = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<{ id: string } | { erreur: string }> => {
        if (data.id) {
          const [before] = await tx
            .select()
            .from(sirhTypesAbsence)
            .where(and(eq(sirhTypesAbsence.id, data.id), isNull(sirhTypesAbsence.deletedAt)));
          if (!before) return { erreur: 'Type d’absence introuvable.' };
          if (before.uniteDecompte !== data.uniteDecompte) {
            const [utilise] = await tx
              .select({ n: count() })
              .from(sirhAbsences)
              .where(and(eq(sirhAbsences.typeAbsenceId, data.id), isNull(sirhAbsences.deletedAt)));
            if ((utilise?.n ?? 0) > 0) {
              return {
                erreur: `Unité de décompte non modifiable : ${utilise?.n} absence(s) déjà enregistrée(s) avec ce type. Créez un nouveau type.`,
              };
            }
          }
          await tx
            .update(sirhTypesAbsence)
            .set({ ...colonnesType(data), updatedBy: ctx.utilisateur.id })
            .where(eq(sirhTypesAbsence.id, data.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_types_absence',
            rowId: data.id,
            before,
            after: data,
          });
          return { id: data.id };
        }
        const [inserted] = await tx
          .insert(sirhTypesAbsence)
          .values({
            entrepriseId: ctx.entreprise.id,
            ...colonnesType(data),
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhTypesAbsence.id });
        if (!inserted) throw new Error('INSERT sirh_types_absence échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_types_absence',
          rowId: inserted.id,
          after: data,
        });
        return { id: inserted.id };
      },
    );
    if ('erreur' in r) return { ok: false, error: r.erreur };
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: r };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un type d’absence porte déjà ce code.',
      controle: 'Couleur invalide (#RRGGBB).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete), refusée si le type est encore référencé par des
 * absences, des compteurs ou des périodes bloquées — le désactiver sinon.
 */
export async function supprimerTypeAbsence(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhTypesAbsence)
      .where(and(eq(sirhTypesAbsence.id, id), isNull(sirhTypesAbsence.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const compter = async (
      table: typeof sirhAbsences | typeof sirhCompteurs | typeof sirhPeriodesBloquees,
    ) => {
      const [row] = await tx
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.typeAbsenceId, id), isNull(table.deletedAt)));
      return row?.n ?? 0;
    };
    const blocage = messageBlocageSuppression("ce type d'absence", [
      { nombre: await compter(sirhAbsences), singulier: 'absence', pluriel: 'absences' },
      { nombre: await compter(sirhCompteurs), singulier: 'compteur', pluriel: 'compteurs' },
      {
        nombre: await compter(sirhPeriodesBloquees),
        singulier: 'période bloquée',
        pluriel: 'périodes bloquées',
      },
    ]);
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(sirhTypesAbsence)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhTypesAbsence.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_types_absence', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Type d’absence introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}
