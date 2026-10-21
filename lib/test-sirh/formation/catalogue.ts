'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhFormations, sirhSessionsFormation } from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import { formationSchema, type FormationInput } from '@/lib/validation/test-sirh/formation';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/**
 * Server actions — Test SIRH › Formation › Catalogue (Factorial
 * trainings/Training + Category). Réservées à la gestion RH.
 */

const idSchema = uuidRequis('Formation');

function revaliderCatalogue(base: string) {
  revalidatePath(`${base}/formation`);
  revalidatePath(`${base}/formation/sessions`);
  revalidatePath(`${base}/formation/habilitations`);
  revalidatePath(base);
}

function colonnesFormation(data: FormationInput) {
  return {
    code: data.code,
    intitule: data.intitule,
    categorie: data.categorie,
    organisme: data.organisme,
    modalite: data.modalite,
    dureeHeures: data.dureeHeures,
    coutHt: data.coutHt,
    obligatoire: data.obligatoire,
    validiteMois: data.validiteMois,
    description: data.description,
    actif: data.actif,
  };
}

/** Crée (sans `id`) ou met à jour (avec `id`) une formation du catalogue. */
export async function enregistrerFormation(
  input: FormationInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = formationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhFormations)
          .where(and(eq(sirhFormations.id, data.id), isNull(sirhFormations.deletedAt)));
        if (!before) return null;
        await tx
          .update(sirhFormations)
          .set({ ...colonnesFormation(data), updatedBy: ctx.utilisateur.id })
          .where(eq(sirhFormations.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_formations',
          rowId: data.id,
          before,
          after: data,
        });
        return data.id;
      }
      const [inserted] = await tx
        .insert(sirhFormations)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnesFormation(data),
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhFormations.id });
      if (!inserted) throw new Error('INSERT sirh_formations échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_formations',
        rowId: inserted.id,
        after: data,
      });
      return inserted.id;
    });
    if (!id) return { ok: false, error: 'Formation introuvable.' };
    revaliderCatalogue(baseSirh(ctx));
    return { ok: true, data: { id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Une formation porte déjà ce code.',
      controle: 'Formation incohérente (durée > 0, coût ≥ 0, validité de 1 à 240 mois).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete) refusée si la formation a des sessions (règle de
 * suppression référentielle) — la désactiver sinon.
 */
export async function supprimerFormation(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Formation introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhFormations)
      .where(and(eq(sirhFormations.id, id), isNull(sirhFormations.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const [row] = await tx
      .select({ n: count() })
      .from(sirhSessionsFormation)
      .where(
        and(eq(sirhSessionsFormation.formationId, id), isNull(sirhSessionsFormation.deletedAt)),
      );
    const blocage = messageBlocageSuppression(
      'cette formation',
      [{ nombre: row?.n ?? 0, singulier: 'session', pluriel: 'sessions' }],
      { feminin: true },
    );
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(sirhFormations)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhFormations.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_formations', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Formation introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revaliderCatalogue(baseSirh(ctx));
  return { ok: true, data: undefined };
}
