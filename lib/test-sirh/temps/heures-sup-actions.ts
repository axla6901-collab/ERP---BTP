'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhHeuresSup, sirhVariablesPaie } from '@/db/schema/test-sirh';
import { decisionSchema, type DecisionInput } from '@/lib/validation/test-sirh/commun';
import { heuresSupSchema, type HeuresSupInput } from '@/lib/validation/test-sirh/temps';

import { employeExiste, employeIdDeLUtilisateur, peutAgirPourEmploye } from '../acces';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { peutGererSirh, peutValiderSirh, ROLES_SIRH_VALIDATION } from '../permissions';

import { chantierExiste, estUuid } from './controles';
import { motifRefusAnnulation, peutDeciderHeuresSup } from './heures-sup';

/**
 * Server actions — Test SIRH › Temps de travail › Heures supplémentaires
 * (Factorial attendance/OvertimeRequest + Review).
 *
 * - Demande : tout rôle pour SA fiche (libre-service) ; un valideur ou un
 *   gestionnaire RH peut déclarer pour n'importe quel collaborateur.
 * - Décision : valideurs, jamais sur sa propre demande (sauf gestionnaire RH).
 * - Annulation : l'auteur ou un valideur tant qu'elle est en attente ; un
 *   valideur une fois approuvée, si elle n'est pas intégrée à la paie.
 */

function revaliderHeuresSup(base: string) {
  revalidatePath(`${base}/temps/heures-sup`);
  revalidatePath(`${base}/temps`);
  revalidatePath(`${base}/validations`);
  revalidatePath(`${base}/mon-espace`);
  revalidatePath(base);
}

/** Crée une demande d'heures supplémentaires (statut `en_attente`). */
export async function demanderHeuresSup(
  input: HeuresSupInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction();
  const parsed = heuresSupSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const autorise = peutValiderSirh(ctx.utilisateur.role)
        ? await employeExiste(tx, data.employeId)
        : await peutAgirPourEmploye(tx, ctx, data.employeId);
      if (!autorise) {
        return {
          type: 'erreur' as const,
          message: 'Vous ne pouvez déclarer des heures supplémentaires que pour vous-même.',
        };
      }
      if (data.chantierId && !(await chantierExiste(tx, data.chantierId))) {
        return { type: 'erreur' as const, message: 'Chantier introuvable.' };
      }
      const [inserted] = await tx
        .insert(sirhHeuresSup)
        .values({
          entrepriseId: ctx.entreprise.id,
          employeId: data.employeId,
          dateHeures: data.dateHeures,
          dureeHeures: data.dureeHeures,
          majorationPct: data.majorationPct,
          compensation: data.compensation,
          motif: data.motif,
          chantierId: data.chantierId,
          statut: 'en_attente',
          demandePar: ctx.utilisateur.id,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhHeuresSup.id });
      if (!inserted) throw new Error('INSERT sirh_heures_sup échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_heures_sup',
        rowId: inserted.id,
        after: data,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderHeuresSup(baseSirh(ctx));
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Durée (0 à 24 h) ou majoration (0, 10, 25, 50 ou 100 %) invalide.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Approuve ou refuse une demande en attente. */
export async function deciderHeuresSup(input: DecisionInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_VALIDATION);
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { id, decision, commentaire } = parsed.data;

  const erreur = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhHeuresSup)
      .where(and(eq(sirhHeuresSup.id, id), isNull(sirhHeuresSup.deletedAt)));
    if (!before) return 'Demande introuvable.';
    if (!peutDeciderHeuresSup(before.statut)) return 'Cette demande a déjà été traitée.';
    if (!peutGererSirh(ctx.utilisateur.role)) {
      const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
      if (moi === before.employeId) return 'Vous ne pouvez pas décider de votre propre demande.';
    }
    const after = {
      statut: decision === 'approuver' ? ('approuvee' as const) : ('refusee' as const),
      valideurId: ctx.utilisateur.id,
      dateDecision: new Date(),
      commentaireDecision: commentaire,
    };
    await tx
      .update(sirhHeuresSup)
      .set({ ...after, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhHeuresSup.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_heures_sup',
      rowId: id,
      before,
      after,
    });
    return null;
  });

  if (erreur) return { ok: false, error: erreur };
  revaliderHeuresSup(baseSirh(ctx));
  return { ok: true, data: undefined };
}

/** Annule une demande (voir règles en tête de fichier). */
export async function annulerHeuresSup(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction();
  if (!estUuid(id)) return { ok: false, error: 'Demande introuvable.' };

  const erreur = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhHeuresSup)
      .where(and(eq(sirhHeuresSup.id, id), isNull(sirhHeuresSup.deletedAt)));
    if (!before) return 'Demande introuvable.';

    const estValideur = peutValiderSirh(ctx.utilisateur.role);
    if (!estValideur && !(await peutAgirPourEmploye(tx, ctx, before.employeId))) {
      return 'Vous ne pouvez annuler que vos propres demandes.';
    }
    const refus = motifRefusAnnulation(before.statut, { estValideur });
    if (refus) return refus;

    if (before.statut === 'approuvee') {
      const [ref] = await tx
        .select({ n: count() })
        .from(sirhVariablesPaie)
        .where(
          and(
            eq(sirhVariablesPaie.source, 'heures_sup'),
            eq(sirhVariablesPaie.sourceId, id),
            isNull(sirhVariablesPaie.deletedAt),
          ),
        );
      if ((ref?.n ?? 0) > 0) {
        return 'Ces heures sont déjà intégrées à une période de paie : supprimez d’abord la variable de paie correspondante.';
      }
    }

    await tx
      .update(sirhHeuresSup)
      .set({ statut: 'annulee', updatedBy: ctx.utilisateur.id })
      .where(eq(sirhHeuresSup.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_heures_sup',
      rowId: id,
      before,
      after: { statut: 'annulee' },
    });
    return null;
  });

  if (erreur) return { ok: false, error: erreur };
  revaliderHeuresSup(baseSirh(ctx));
  return { ok: true, data: undefined };
}
