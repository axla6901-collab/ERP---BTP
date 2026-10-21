'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import {
  sirhAnnonces,
  sirhCollaborateurs,
  sirhContrats,
  sirhEquipes,
  sirhJoursFeries,
  sirhOffres,
  sirhSites,
} from '@/db/schema/test-sirh';
import { siteSchema, type SiteInput } from '@/lib/validation/test-sirh/organisation';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/** Colonnes métier d'un site, dérivées de l'input validé. */
function colonnesSite(data: SiteInput) {
  return {
    code: data.code,
    nom: data.nom,
    typeSite: data.typeSite,
    adresseLigne1: data.adresseLigne1,
    adresseLigne2: data.adresseLigne2,
    codePostal: data.codePostal,
    ville: data.ville,
    pays: data.pays,
    telephone: data.telephone,
    actif: data.actif,
    notes: data.notes,
  };
}

/** Crée (sans `id`) ou met à jour (avec `id`) un lieu de travail. */
export async function enregistrerSite(input: SiteInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = siteSchema.safeParse(input);
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
          .from(sirhSites)
          .where(and(eq(sirhSites.id, data.id), isNull(sirhSites.deletedAt)));
        if (!before) return null;
        await tx
          .update(sirhSites)
          .set({ ...colonnesSite(data), updatedBy: ctx.utilisateur.id })
          .where(eq(sirhSites.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_sites',
          rowId: data.id,
          before,
          after: data,
        });
        return data.id;
      }
      const [inserted] = await tx
        .insert(sirhSites)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnesSite(data),
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhSites.id });
      if (!inserted) throw new Error('INSERT sirh_sites échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_sites',
        rowId: inserted.id,
        after: data,
      });
      return inserted.id;
    });
    if (!id) return { ok: false, error: 'Site introuvable.' };
    revalidatePath(`${baseSirh(ctx)}/organisation`);
    return { ok: true, data: { id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un site porte déjà ce nom ou ce code.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete). Refusée si le site est encore référencé
 * (règle générale de suppression référentielle) — le désactiver sinon.
 */
export async function supprimerSite(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhSites)
      .where(and(eq(sirhSites.id, id), isNull(sirhSites.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const compter = async (
      table:
        | typeof sirhEquipes
        | typeof sirhCollaborateurs
        | typeof sirhContrats
        | typeof sirhOffres
        | typeof sirhAnnonces
        | typeof sirhJoursFeries,
    ) => {
      const [row] = await tx
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.siteId, id), isNull(table.deletedAt)));
      return row?.n ?? 0;
    };
    const blocage = messageBlocageSuppression('ce site', [
      {
        nombre: await compter(sirhCollaborateurs),
        singulier: 'collaborateur',
        pluriel: 'collaborateurs',
      },
      { nombre: await compter(sirhContrats), singulier: 'contrat', pluriel: 'contrats' },
      { nombre: await compter(sirhEquipes), singulier: 'équipe', pluriel: 'équipes' },
      {
        nombre: await compter(sirhOffres),
        singulier: "offre d'emploi",
        pluriel: "offres d'emploi",
      },
      { nombre: await compter(sirhAnnonces), singulier: 'annonce', pluriel: 'annonces' },
      { nombre: await compter(sirhJoursFeries), singulier: 'jour férié', pluriel: 'jours fériés' },
    ]);
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(sirhSites)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhSites.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_sites', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Site introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revalidatePath(`${baseSirh(ctx)}/organisation`);
  return { ok: true, data: undefined };
}
