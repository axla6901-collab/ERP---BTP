'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhNotesFrais, sirhPeriodesPaie, sirhVariablesPaie } from '@/db/schema/test-sirh';
import {
  periodePaieSchema,
  statutPeriodeSchema,
  type PeriodePaieInput,
  type StatutPeriodeInput,
} from '@/lib/validation/test-sirh/paie';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { peutGererSirh, ROLES_SIRH_PAIE } from '../permissions';
import { estUuid } from '../temps/controles';

import { libellePeriode, verifierTransitionPeriode } from './periodes';

/**
 * Server actions — Test SIRH › Paie › Périodes (Factorial payroll/PolicyPeriod,
 * compensations/PayrollRun). Rôles PAIE ; la réouverture d'une période clôturée
 * est réservée aux gestionnaires RH.
 */

function revaliderPaie(base: string, periodeId?: string) {
  revalidatePath(`${base}/paie`);
  if (periodeId) revalidatePath(`${base}/paie/${periodeId}`);
  revalidatePath(base);
}

/** Crée la période d'un mois (statut `ouverte`). */
export async function creerPeriodePaie(
  input: PeriodePaieInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  const parsed = periodePaieSchema.safeParse(input);
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
      const [inserted] = await tx
        .insert(sirhPeriodesPaie)
        .values({
          entrepriseId: ctx.entreprise.id,
          annee: data.annee,
          mois: data.mois,
          statut: 'ouverte',
          notes: data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhPeriodesPaie.id });
      if (!inserted) throw new Error('INSERT sirh_periodes_paie échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_periodes_paie',
        rowId: inserted.id,
        after: data,
      });
      return inserted.id;
    });
    revaliderPaie(baseSirh(ctx));
    return { ok: true, data: { id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: `La période de ${libellePeriode(data)} existe déjà.`,
      controle: 'Mois ou année invalide.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Change le statut d'une période (`ouverte → en_controle → cloturee`, retour en
 * saisie, réouverture par un gestionnaire RH). La clôture trace date et auteur.
 */
export async function changerStatutPeriodePaie(input: StatutPeriodeInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  const parsed = statutPeriodeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { id, statut } = parsed.data;

  const erreur = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhPeriodesPaie)
      .where(and(eq(sirhPeriodesPaie.id, id), isNull(sirhPeriodesPaie.deletedAt)));
    if (!before) return 'Période introuvable.';
    const refus = verifierTransitionPeriode(before.statut, statut, {
      peutGerer: peutGererSirh(ctx.utilisateur.role),
    });
    if (refus) return refus;

    const after =
      statut === 'cloturee'
        ? { statut, dateCloture: new Date(), cloturePar: ctx.utilisateur.id }
        : { statut, dateCloture: null, cloturePar: null };
    await tx
      .update(sirhPeriodesPaie)
      .set({ ...after, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhPeriodesPaie.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_periodes_paie',
      rowId: id,
      before,
      after,
    });
    return null;
  });

  if (erreur) return { ok: false, error: erreur };
  revaliderPaie(baseSirh(ctx), id);
  return { ok: true, data: undefined };
}

/**
 * Supprime (soft-delete) une période OUVERTE et vide — erreur de saisie du mois.
 * Refusée tant qu'elle contient des variables ou des notes de frais rattachées.
 */
export async function supprimerPeriodePaie(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  if (!estUuid(id)) return { ok: false, error: 'Période introuvable.' };

  const erreur = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhPeriodesPaie)
      .where(and(eq(sirhPeriodesPaie.id, id), isNull(sirhPeriodesPaie.deletedAt)));
    if (!before) return 'Période introuvable.';
    if (before.statut !== 'ouverte') {
      return 'Seule une période ouverte peut être supprimée.';
    }
    const [variables] = await tx
      .select({ n: count() })
      .from(sirhVariablesPaie)
      .where(and(eq(sirhVariablesPaie.periodeId, id), isNull(sirhVariablesPaie.deletedAt)));
    const [frais] = await tx
      .select({ n: count() })
      .from(sirhNotesFrais)
      .where(and(eq(sirhNotesFrais.periodePaieId, id), isNull(sirhNotesFrais.deletedAt)));
    const nbVariables = variables?.n ?? 0;
    const nbFrais = frais?.n ?? 0;
    if (nbVariables > 0 || nbFrais > 0) {
      const parties = [
        nbVariables > 0 ? `${nbVariables} variable${nbVariables > 1 ? 's' : ''} de paie` : null,
        nbFrais > 0
          ? `${nbFrais} note${nbFrais > 1 ? 's' : ''} de frais rattachée${nbFrais > 1 ? 's' : ''}`
          : null,
      ].filter(Boolean);
      return `Suppression impossible : la période contient ${parties.join(' et ')}. Supprimez d’abord les variables.`;
    }

    await tx
      .update(sirhPeriodesPaie)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhPeriodesPaie.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_periodes_paie', rowId: id, before });
    return null;
  });

  if (erreur) return { ok: false, error: erreur };
  revaliderPaie(baseSirh(ctx));
  return { ok: true, data: undefined };
}
