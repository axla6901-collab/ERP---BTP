'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import {
  sirhFormations,
  sirhInscriptionsFormation,
  sirhSessionsFormation,
} from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import { sessionSchema, type SessionInput } from '@/lib/validation/test-sirh/formation';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';
import { calculerCloture, dateValiditeInscription } from './validite';

/**
 * Server actions — Test SIRH › Formation › Sessions (Factorial trainings/Session).
 * Réservées à la gestion RH.
 */

const idSchema = uuidRequis('Session');

function revaliderSessions(base: string, sessionId?: string) {
  revalidatePath(`${base}/formation`);
  revalidatePath(`${base}/formation/sessions`);
  revalidatePath(`${base}/formation/habilitations`);
  if (sessionId) revalidatePath(`${base}/formation/sessions/${sessionId}`);
  revalidatePath(base);
}

async function lireFormation(tx: TenantTx, formationId: string) {
  const [row] = await tx
    .select({
      id: sirhFormations.id,
      actif: sirhFormations.actif,
      validiteMois: sirhFormations.validiteMois,
      dureeHeures: sirhFormations.dureeHeures,
    })
    .from(sirhFormations)
    .where(and(eq(sirhFormations.id, formationId), isNull(sirhFormations.deletedAt)));
  return row ?? null;
}

async function compterInscriptions(tx: TenantTx, sessionId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(sirhInscriptionsFormation)
    .where(
      and(
        eq(sirhInscriptionsFormation.sessionId, sessionId),
        isNull(sirhInscriptionsFormation.deletedAt),
      ),
    );
  return row?.n ?? 0;
}

function colonnesSession(data: SessionInput) {
  return {
    formationId: data.formationId,
    dateDebut: data.dateDebut,
    dateFin: data.dateFin,
    lieu: data.lieu,
    formateur: data.formateur,
    placesMax: data.placesMax,
    coutHt: data.coutHt,
    statut: data.statut,
    notes: data.notes,
  };
}

/**
 * Crée (sans `id`) ou met à jour (avec `id`) une session. Une session avec des
 * inscrits ne change pas de formation ; si sa date de fin change, les dates de
 * validité des participants reçus sont recalculées.
 */
export async function enregistrerSession(
  input: SessionInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = sessionSchema.safeParse(input);
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
      const formation = await lireFormation(tx, data.formationId);
      if (!formation) return { type: 'erreur' as const, message: 'Formation introuvable.' };

      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhSessionsFormation)
          .where(
            and(eq(sirhSessionsFormation.id, data.id), isNull(sirhSessionsFormation.deletedAt)),
          );
        if (!before) return { type: 'erreur' as const, message: 'Session introuvable.' };
        if (
          before.formationId !== data.formationId &&
          (await compterInscriptions(tx, data.id)) > 0
        ) {
          return {
            type: 'erreur' as const,
            message: 'Cette session a des inscrits : sa formation ne peut plus être changée.',
          };
        }
        await tx
          .update(sirhSessionsFormation)
          .set({ ...colonnesSession(data), updatedBy: ctx.utilisateur.id })
          .where(eq(sirhSessionsFormation.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_sessions_formation',
          rowId: data.id,
          before,
          after: data,
        });

        if (before.dateFin !== data.dateFin) {
          const recus = await tx
            .select()
            .from(sirhInscriptionsFormation)
            .where(
              and(
                eq(sirhInscriptionsFormation.sessionId, data.id),
                isNull(sirhInscriptionsFormation.deletedAt),
                eq(sirhInscriptionsFormation.resultat, 'reussi'),
              ),
            );
          for (const i of recus) {
            const dateValidite = dateValiditeInscription(
              'reussi',
              data.dateFin,
              formation.validiteMois,
            );
            if (dateValidite === i.dateValidite) continue;
            await tx
              .update(sirhInscriptionsFormation)
              .set({ dateValidite, updatedBy: ctx.utilisateur.id })
              .where(eq(sirhInscriptionsFormation.id, i.id));
            await auditLogIn(tx, {
              action: 'update',
              tableName: 'sirh_inscriptions_formation',
              rowId: i.id,
              before: i,
              after: { dateValidite },
            });
          }
        }
        return { type: 'ok' as const, id: data.id };
      }

      if (!formation.actif) {
        return {
          type: 'erreur' as const,
          message: 'Formation inactive : réactivez-la dans le catalogue pour la programmer.',
        };
      }
      const [inserted] = await tx
        .insert(sirhSessionsFormation)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnesSession(data),
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhSessionsFormation.id });
      if (!inserted) throw new Error('INSERT sirh_sessions_formation échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_sessions_formation',
        rowId: inserted.id,
        after: data,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderSessions(baseSirh(ctx), resultat.id);
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Session incohérente (dates, places > 0, coût ≥ 0).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete) refusée tant que la session a des inscriptions
 * (règle de suppression référentielle) — l'annuler sinon.
 */
export async function supprimerSession(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Session introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhSessionsFormation)
      .where(and(eq(sirhSessionsFormation.id, id), isNull(sirhSessionsFormation.deletedAt)));
    if (!before) return { type: 'erreur' as const, message: 'Session introuvable.' };
    const blocage = messageBlocageSuppression(
      'cette session',
      [
        {
          nombre: await compterInscriptions(tx, id),
          singulier: 'inscription',
          pluriel: 'inscriptions',
        },
      ],
      { feminin: true, conseil: 'Annulez-la plutôt (statut « Annulée »).' },
    );
    if (blocage) return { type: 'erreur' as const, message: blocage };

    await tx
      .update(sirhSessionsFormation)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhSessionsFormation.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_sessions_formation',
      rowId: id,
      before,
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderSessions(baseSirh(ctx));
  return { ok: true, data: undefined };
}

/**
 * « Clôturer la session » : statut réalisée ; les inscrits deviennent présents
 * et les présents non évalués « réussi » (date de validité calculée) ; les
 * heures réalisées manquantes reprennent la durée catalogue.
 */
export async function cloturerSession(id: string): Promise<ActionResult<{ misesAJour: number }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Session introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [session] = await tx
      .select()
      .from(sirhSessionsFormation)
      .where(and(eq(sirhSessionsFormation.id, id), isNull(sirhSessionsFormation.deletedAt)))
      .for('update');
    if (!session) return { type: 'erreur' as const, message: 'Session introuvable.' };
    if (session.statut === 'annulee') {
      return {
        type: 'erreur' as const,
        message: 'Session annulée : elle ne peut pas être clôturée.',
      };
    }
    const formation = await lireFormation(tx, session.formationId);
    if (!formation) return { type: 'erreur' as const, message: 'Formation introuvable.' };

    const inscriptions = await tx
      .select()
      .from(sirhInscriptionsFormation)
      .where(
        and(
          eq(sirhInscriptionsFormation.sessionId, id),
          isNull(sirhInscriptionsFormation.deletedAt),
        ),
      );
    const majs = calculerCloture(inscriptions, {
      dateFin: session.dateFin,
      validiteMois: formation.validiteMois,
      dureeHeures: formation.dureeHeures,
    });
    const parId = new Map(inscriptions.map((i) => [i.id, i]));
    for (const { id: inscriptionId, ...maj } of majs) {
      await tx
        .update(sirhInscriptionsFormation)
        .set({ ...maj, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhInscriptionsFormation.id, inscriptionId));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_inscriptions_formation',
        rowId: inscriptionId,
        before: parId.get(inscriptionId),
        after: maj,
      });
    }

    if (session.statut !== 'realisee') {
      await tx
        .update(sirhSessionsFormation)
        .set({ statut: 'realisee', updatedBy: ctx.utilisateur.id })
        .where(eq(sirhSessionsFormation.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_sessions_formation',
        rowId: id,
        before: session,
        after: { statut: 'realisee' },
      });
    }
    return { type: 'ok' as const, misesAJour: majs.length };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderSessions(baseSirh(ctx), id);
  return { ok: true, data: { misesAJour: resultat.misesAJour } };
}
