'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { TenantContext } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { sirhEntretiens, sirhObjectifs } from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import { objectifSchema, type ObjectifInput } from '@/lib/validation/test-sirh/entretiens';

import { employeExiste } from '../acces';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '../permissions';
import { estEvaluateur } from './droits';

/**
 * Server actions — Test SIRH › Objectifs (Factorial performance/ReviewProcessTarget).
 *
 * La RH gère tous les objectifs. L'évaluateur d'un entretien gère les objectifs
 * de SON collaborateur rattachés à cet entretien (objectifs fixés pendant
 * l'entretien = partie du compte rendu).
 */

const idSchema = uuidRequis('Objectif');

function revaliderObjectifs(base: string, entretienIds: ReadonlyArray<string | null>) {
  revalidatePath(`${base}/entretiens`);
  for (const id of new Set(entretienIds)) if (id) revalidatePath(`${base}/entretiens/${id}`);
}

async function lireEntretienDeRattachement(tx: TenantTx, entretienId: string) {
  const [row] = await tx
    .select({
      id: sirhEntretiens.id,
      employeId: sirhEntretiens.employeId,
      evaluateurId: sirhEntretiens.evaluateurId,
    })
    .from(sirhEntretiens)
    .where(and(eq(sirhEntretiens.id, entretienId), isNull(sirhEntretiens.deletedAt)));
  return row ?? null;
}

/** L'évaluateur de l'entretien `entretienId` est-il l'utilisateur courant ? */
async function evaluateurDe(
  tx: TenantTx,
  ctx: TenantContext,
  entretienId: string | null,
): Promise<boolean> {
  if (!entretienId) return false;
  const entretien = await lireEntretienDeRattachement(tx, entretienId);
  return entretien !== null && (await estEvaluateur(tx, ctx, entretien.evaluateurId));
}

/** Crée (sans `id`) ou met à jour (avec `id`) un objectif individuel. */
export async function enregistrerObjectif(
  input: ObjectifInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const parsed = objectifSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const gestion = peutGererSirh(ctx.utilisateur.role);

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      if (!(await employeExiste(tx, data.employeId))) {
        return { type: 'erreur' as const, message: 'Collaborateur introuvable.' };
      }
      if (data.entretienId) {
        const entretien = await lireEntretienDeRattachement(tx, data.entretienId);
        if (!entretien) return { type: 'erreur' as const, message: 'Entretien introuvable.' };
        if (entretien.employeId !== data.employeId) {
          return {
            type: 'erreur' as const,
            message: 'L’entretien de rattachement concerne un autre collaborateur.',
          };
        }
      }
      if (!gestion && !(await evaluateurDe(tx, ctx, data.entretienId))) {
        return {
          type: 'erreur' as const,
          message: 'Seuls la RH et l’évaluateur de l’entretien peuvent gérer ces objectifs.',
        };
      }

      const colonnes = {
        employeId: data.employeId,
        entretienId: data.entretienId,
        libelle: data.libelle,
        description: data.description,
        dateEcheance: data.dateEcheance,
        poids: data.poids,
        progression: data.progression,
        statut: data.statut,
      };

      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhObjectifs)
          .where(and(eq(sirhObjectifs.id, data.id), isNull(sirhObjectifs.deletedAt)));
        if (!before) return { type: 'erreur' as const, message: 'Objectif introuvable.' };
        if (before.employeId !== data.employeId) {
          return {
            type: 'erreur' as const,
            message: 'Un objectif ne peut pas changer de collaborateur.',
          };
        }
        // L'évaluateur ne modifie que les objectifs déjà rattachés à SON entretien.
        if (!gestion && before.entretienId !== data.entretienId) {
          return {
            type: 'erreur' as const,
            message: 'Seule la RH peut rattacher cet objectif à un autre entretien.',
          };
        }
        await tx
          .update(sirhObjectifs)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhObjectifs.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_objectifs',
          rowId: data.id,
          before,
          after: colonnes,
        });
        return {
          type: 'ok' as const,
          id: data.id,
          entretiens: [before.entretienId, data.entretienId],
        };
      }

      const [inserted] = await tx
        .insert(sirhObjectifs)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhObjectifs.id });
      if (!inserted) throw new Error('INSERT sirh_objectifs échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_objectifs',
        rowId: inserted.id,
        after: colonnes,
      });
      return { type: 'ok' as const, id: inserted.id, entretiens: [data.entretienId] };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderObjectifs(baseSirh(ctx), resultat.entretiens);
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Objectif incohérent (poids et progression entre 0 et 100).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Suppression (soft-delete) d'un objectif (aucune autre table ne le référence). */
export async function supprimerObjectif(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Objectif introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhObjectifs)
      .where(and(eq(sirhObjectifs.id, id), isNull(sirhObjectifs.deletedAt)));
    if (!before) return { type: 'erreur' as const, message: 'Objectif introuvable.' };
    if (
      !peutGererSirh(ctx.utilisateur.role) &&
      !(await evaluateurDe(tx, ctx, before.entretienId))
    ) {
      return {
        type: 'erreur' as const,
        message: 'Seuls la RH et l’évaluateur de l’entretien peuvent supprimer cet objectif.',
      };
    }
    await tx
      .update(sirhObjectifs)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhObjectifs.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_objectifs', rowId: id, before });
    return { type: 'ok' as const, entretienId: before.entretienId };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderObjectifs(baseSirh(ctx), [resultat.entretienId]);
  return { ok: true, data: undefined };
}
