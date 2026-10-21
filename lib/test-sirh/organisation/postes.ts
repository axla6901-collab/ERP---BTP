'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhCollaborateurs, sirhContrats, sirhOffres, sirhPostes } from '@/db/schema/test-sirh';
import { posteSchema, type PosteInput } from '@/lib/validation/test-sirh/organisation';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/**
 * Server actions — Test SIRH › Organisation › Catalogue des postes (Factorial
 * job_catalog). Gestion réservée à ROLES_SIRH_GESTION.
 */

/** Colonnes métier d'un poste, dérivées de l'input validé. */
function colonnesPoste(data: PosteInput) {
  return {
    code: data.code,
    intitule: data.intitule,
    famille: data.famille,
    categorie: data.categorie,
    niveau: data.niveau,
    coefficient: data.coefficient,
    description: data.description,
    actif: data.actif,
  };
}

/** Crée (sans `id`) ou met à jour (avec `id`) un poste du catalogue. */
export async function enregistrerPoste(input: PosteInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = posteSchema.safeParse(input);
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
          .from(sirhPostes)
          .where(and(eq(sirhPostes.id, data.id), isNull(sirhPostes.deletedAt)));
        if (!before) return null;
        await tx
          .update(sirhPostes)
          .set({ ...colonnesPoste(data), updatedBy: ctx.utilisateur.id })
          .where(eq(sirhPostes.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_postes',
          rowId: data.id,
          before,
          after: data,
        });
        return data.id;
      }
      const [inserted] = await tx
        .insert(sirhPostes)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnesPoste(data),
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhPostes.id });
      if (!inserted) throw new Error('INSERT sirh_postes échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_postes',
        rowId: inserted.id,
        after: data,
      });
      return inserted.id;
    });
    if (!id) return { ok: false, error: 'Poste introuvable.' };
    revalidatePath(`${baseSirh(ctx)}/organisation/postes`);
    return { ok: true, data: { id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un poste porte déjà ce code.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete). Refusée si le poste est encore référencé par des
 * collaborateurs, des contrats ou des offres d'emploi — le désactiver sinon.
 */
export async function supprimerPoste(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);

  const resultat = await withTenant(ctx.entreprise.id, async (tx): Promise<ActionResult> => {
    const [before] = await tx
      .select()
      .from(sirhPostes)
      .where(and(eq(sirhPostes.id, id), isNull(sirhPostes.deletedAt)));
    if (!before) return { ok: false, error: 'Poste introuvable.' };

    const compter = async (
      table: typeof sirhCollaborateurs | typeof sirhContrats | typeof sirhOffres,
    ) => {
      const [row] = await tx
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.posteId, id), isNull(table.deletedAt)));
      return row?.n ?? 0;
    };
    const blocage = messageBlocageSuppression('ce poste', [
      {
        nombre: await compter(sirhCollaborateurs),
        singulier: 'collaborateur',
        pluriel: 'collaborateurs',
      },
      { nombre: await compter(sirhContrats), singulier: 'contrat', pluriel: 'contrats' },
      {
        nombre: await compter(sirhOffres),
        singulier: "offre d'emploi",
        pluriel: "offres d'emploi",
      },
    ]);
    if (blocage) return { ok: false, error: blocage };

    await tx
      .update(sirhPostes)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhPostes.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_postes', rowId: id, before });
    return { ok: true, data: undefined };
  });

  if (resultat.ok) revalidatePath(`${baseSirh(ctx)}/organisation/postes`);
  return resultat;
}
