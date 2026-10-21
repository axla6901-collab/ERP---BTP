'use server';

import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhFormations,
  sirhInscriptionsFormation,
  sirhSessionsFormation,
} from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import {
  inscriptionSchema,
  inscriptionsSchema,
  type InscriptionInput,
  type InscriptionsInput,
} from '@/lib/validation/test-sirh/formation';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';
import { compterOccupants, dateValiditeInscription, verifierCapacite } from './validite';

/**
 * Server actions — Test SIRH › Formation › Inscriptions & présence (Factorial
 * trainings/TrainingMembership + SessionAttendance). Réservées à la gestion RH.
 */

const idSchema = uuidRequis('Inscription');

function revaliderInscriptions(base: string, sessionId: string) {
  revalidatePath(`${base}/formation`);
  revalidatePath(`${base}/formation/sessions`);
  revalidatePath(`${base}/formation/sessions/${sessionId}`);
  revalidatePath(`${base}/formation/habilitations`);
  revalidatePath(base);
}

function messagePlaces(restantes: number, demandees: number): string {
  return `Places insuffisantes : ${restantes} place${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''} pour ${demandees} inscription${demandees > 1 ? 's' : ''}.`;
}

/** Session verrouillée (FOR UPDATE) : les contrôles de jauge sont sérialisés. */
async function lireSessionVerrouillee(tx: TenantTx, sessionId: string) {
  const [row] = await tx
    .select({
      id: sirhSessionsFormation.id,
      dateFin: sirhSessionsFormation.dateFin,
      placesMax: sirhSessionsFormation.placesMax,
      statut: sirhSessionsFormation.statut,
      validiteMois: sirhFormations.validiteMois,
    })
    .from(sirhSessionsFormation)
    .innerJoin(sirhFormations, eq(sirhFormations.id, sirhSessionsFormation.formationId))
    .where(and(eq(sirhSessionsFormation.id, sessionId), isNull(sirhSessionsFormation.deletedAt)))
    .for('update', { of: sirhSessionsFormation });
  return row ?? null;
}

/**
 * Inscrit un ou plusieurs collaborateurs. Les déjà-inscrits sont ignorés
 * (unicité session × employé) ; l'ajout est refusé au-delà de `places_max`.
 */
export async function inscrireEmployes(
  input: InscriptionsInput,
): Promise<ActionResult<{ inscrits: number; dejaInscrits: number }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = inscriptionsSchema.safeParse(input);
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
      const session = await lireSessionVerrouillee(tx, data.sessionId);
      if (!session) return { type: 'erreur' as const, message: 'Session introuvable.' };
      if (session.statut === 'annulee') {
        return { type: 'erreur' as const, message: 'Session annulée : inscriptions fermées.' };
      }

      const trouves = await tx
        .select({ id: employes.id })
        .from(employes)
        .where(and(inArray(employes.id, data.employeIds), isNull(employes.deletedAt)));
      if (trouves.length !== data.employeIds.length) {
        return { type: 'erreur' as const, message: 'Collaborateur introuvable.' };
      }

      const existantes = await tx
        .select({
          employeId: sirhInscriptionsFormation.employeId,
          statut: sirhInscriptionsFormation.statut,
        })
        .from(sirhInscriptionsFormation)
        .where(
          and(
            eq(sirhInscriptionsFormation.sessionId, session.id),
            isNull(sirhInscriptionsFormation.deletedAt),
          ),
        );
      const deja = new Set(existantes.map((e) => e.employeId));
      const nouveaux = data.employeIds.filter((id) => !deja.has(id));
      const capacite = verifierCapacite(
        session.placesMax,
        compterOccupants(existantes.map((e) => e.statut)),
        nouveaux.length,
      );
      if (!capacite.ok) {
        return {
          type: 'erreur' as const,
          message: messagePlaces(capacite.restantes, nouveaux.length),
        };
      }

      const crees =
        nouveaux.length === 0
          ? []
          : await tx
              .insert(sirhInscriptionsFormation)
              .values(
                nouveaux.map((employeId) => ({
                  entrepriseId: ctx.entreprise.id,
                  sessionId: session.id,
                  employeId,
                  statut: 'inscrit' as const,
                  resultat: 'non_evalue' as const,
                  createdBy: ctx.utilisateur.id,
                  updatedBy: ctx.utilisateur.id,
                })),
              )
              .onConflictDoNothing()
              .returning({
                id: sirhInscriptionsFormation.id,
                employeId: sirhInscriptionsFormation.employeId,
              });
      for (const c of crees) {
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_inscriptions_formation',
          rowId: c.id,
          after: { sessionId: session.id, employeId: c.employeId, statut: 'inscrit' },
        });
      }
      return {
        type: 'ok' as const,
        inscrits: crees.length,
        dejaInscrits: data.employeIds.length - crees.length,
      };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderInscriptions(baseSirh(ctx), data.sessionId);
    return { ok: true, data: { inscrits: resultat.inscrits, dejaInscrits: resultat.dejaInscrits } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un de ces collaborateurs est déjà inscrit à cette session.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Présence, résultat, heures et commentaire d'une inscription. Un résultat
 * « réussi » fixe la date de validité (fin de session + validité de la
 * formation) ; réactiver une inscription annulée revérifie la jauge.
 */
export async function modifierInscription(
  input: InscriptionInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = inscriptionSchema.safeParse(input);
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
      const [before] = await tx
        .select()
        .from(sirhInscriptionsFormation)
        .where(
          and(
            eq(sirhInscriptionsFormation.id, data.id),
            isNull(sirhInscriptionsFormation.deletedAt),
          ),
        );
      if (!before) return { type: 'erreur' as const, message: 'Inscription introuvable.' };
      const session = await lireSessionVerrouillee(tx, before.sessionId);
      if (!session) return { type: 'erreur' as const, message: 'Session introuvable.' };

      if (before.statut === 'annule' && data.statut !== 'annule') {
        const autres = await tx
          .select({ statut: sirhInscriptionsFormation.statut })
          .from(sirhInscriptionsFormation)
          .where(
            and(
              eq(sirhInscriptionsFormation.sessionId, session.id),
              isNull(sirhInscriptionsFormation.deletedAt),
              ne(sirhInscriptionsFormation.id, before.id),
            ),
          );
        const capacite = verifierCapacite(
          session.placesMax,
          compterOccupants(autres.map((a) => a.statut)),
          1,
        );
        if (!capacite.ok) return { type: 'erreur' as const, message: messagePlaces(0, 1) };
      }

      const maj = {
        statut: data.statut,
        resultat: data.resultat,
        heuresRealisees: data.heuresRealisees,
        commentaire: data.commentaire,
        dateValidite: dateValiditeInscription(data.resultat, session.dateFin, session.validiteMois),
      };
      await tx
        .update(sirhInscriptionsFormation)
        .set({ ...maj, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhInscriptionsFormation.id, data.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_inscriptions_formation',
        rowId: data.id,
        before,
        after: maj,
      });
      return { type: 'ok' as const, sessionId: session.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderInscriptions(baseSirh(ctx), resultat.sessionId);
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Heures réalisées invalides (≥ 0).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Retrait (soft-delete) d'une inscription non pointée et non évaluée. Une
 * inscription déjà pointée (présent / absent) ou évaluée est conservée :
 * la passer en « Annulé ».
 */
export async function retirerInscription(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Inscription introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhInscriptionsFormation)
      .where(
        and(eq(sirhInscriptionsFormation.id, id), isNull(sirhInscriptionsFormation.deletedAt)),
      );
    if (!before) return { type: 'erreur' as const, message: 'Inscription introuvable.' };
    if (
      before.resultat !== 'non_evalue' ||
      before.statut === 'present' ||
      before.statut === 'absent'
    ) {
      return {
        type: 'erreur' as const,
        message: 'Inscription déjà pointée ou évaluée : passez-la en « Annulé » plutôt.',
      };
    }
    await tx
      .update(sirhInscriptionsFormation)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhInscriptionsFormation.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_inscriptions_formation',
      rowId: id,
      before,
    });
    return { type: 'ok' as const, sessionId: before.sessionId };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderInscriptions(baseSirh(ctx), resultat.sessionId);
  return { ok: true, data: undefined };
}
