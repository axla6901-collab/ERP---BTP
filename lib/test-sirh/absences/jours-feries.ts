'use server';

import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { sirhJoursFeries, sirhSites } from '@/db/schema/test-sirh';
import {
  generationFeriesSchema,
  jourFerieSchema,
  type GenerationFeriesInput,
  type JourFerieInput,
} from '@/lib/validation/test-sirh/absences';

import { joursFeriesFrance } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/** Server actions — jours fériés (Factorial CompanyHoliday). Gestion RH uniquement. */

const MESSAGE_DOUBLON = 'Ce jour férié existe déjà (même date, même site ou tous les sites).';

async function siteExiste(tx: TenantTx, siteId: string): Promise<boolean> {
  const [site] = await tx
    .select({ id: sirhSites.id })
    .from(sirhSites)
    .where(and(eq(sirhSites.id, siteId), isNull(sirhSites.deletedAt)));
  return Boolean(site);
}

/** Crée (sans `id`) ou met à jour (avec `id`) un jour férié, global ou propre à un site. */
export async function enregistrerJourFerie(
  input: JourFerieInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = jourFerieSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const colonnes = {
    dateFerie: data.dateFerie,
    libelle: data.libelle,
    siteId: data.siteId,
    chome: data.chome,
  };

  try {
    const r = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<{ id: string } | { erreur: string; champ?: string }> => {
        if (data.siteId && !(await siteExiste(tx, data.siteId))) {
          return { erreur: 'Site introuvable.', champ: 'siteId' };
        }
        if (data.id) {
          const [before] = await tx
            .select()
            .from(sirhJoursFeries)
            .where(and(eq(sirhJoursFeries.id, data.id), isNull(sirhJoursFeries.deletedAt)));
          if (!before) return { erreur: 'Jour férié introuvable.' };
          await tx
            .update(sirhJoursFeries)
            .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
            .where(eq(sirhJoursFeries.id, data.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_jours_feries',
            rowId: data.id,
            before,
            after: data,
          });
          return { id: data.id };
        }
        const [inserted] = await tx
          .insert(sirhJoursFeries)
          .values({
            entrepriseId: ctx.entreprise.id,
            ...colonnes,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhJoursFeries.id });
        if (!inserted) throw new Error('INSERT sirh_jours_feries échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_jours_feries',
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
    const message = messageErreurContrainte(err, { unicite: MESSAGE_DOUBLON });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Suppression (soft-delete) — aucune table ne référence un jour férié. */
export async function supprimerJourFerie(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhJoursFeries)
      .where(and(eq(sirhJoursFeries.id, id), isNull(sirhJoursFeries.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhJoursFeries)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhJoursFeries.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_jours_feries', rowId: id, before });
    return true;
  });
  if (!supprime) return { ok: false, error: 'Jour férié introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/**
 * « Générer l'année N » : insère les jours fériés légaux français de l'année
 * (option Alsace-Moselle : Vendredi saint + Saint-Étienne), pour tous les sites
 * ou pour un site. Les dates déjà présentes (globales, ou du même site) sont
 * ignorées : l'opération est idempotente.
 */
export async function genererJoursFeries(
  input: GenerationFeriesInput,
): Promise<ActionResult<{ crees: number; ignores: number }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = generationFeriesSchema.safeParse(input);
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
      async (tx): Promise<{ crees: number; ignores: number } | { erreur: string }> => {
        if (data.siteId && !(await siteExiste(tx, data.siteId))) {
          return { erreur: 'Site introuvable.' };
        }
        const existants = await tx
          .select({ date: sirhJoursFeries.dateFerie, siteId: sirhJoursFeries.siteId })
          .from(sirhJoursFeries)
          .where(
            and(
              isNull(sirhJoursFeries.deletedAt),
              gte(sirhJoursFeries.dateFerie, `${data.annee}-01-01`),
              lte(sirhJoursFeries.dateFerie, `${data.annee}-12-31`),
            ),
          );
        const dejaPresentes = new Set(
          existants
            .filter((e) => e.siteId === null || (data.siteId !== null && e.siteId === data.siteId))
            .map((e) => e.date),
        );
        const liste = joursFeriesFrance(data.annee, { alsaceMoselle: data.alsaceMoselle });
        const aCreer = liste.filter((f) => !dejaPresentes.has(f.date));

        if (aCreer.length > 0) {
          const inserted = await tx
            .insert(sirhJoursFeries)
            .values(
              aCreer.map((f) => ({
                entrepriseId: ctx.entreprise.id,
                dateFerie: f.date,
                libelle: f.libelle,
                siteId: data.siteId,
                chome: true,
                createdBy: ctx.utilisateur.id,
                updatedBy: ctx.utilisateur.id,
              })),
            )
            .returning({ id: sirhJoursFeries.id });
          for (const [i, row] of inserted.entries()) {
            await auditLogIn(tx, {
              action: 'insert',
              tableName: 'sirh_jours_feries',
              rowId: row.id,
              after: { ...aCreer[i], siteId: data.siteId, generation: data.annee },
            });
          }
        }
        return { crees: aCreer.length, ignores: liste.length - aCreer.length };
      },
    );
    if ('erreur' in r) return { ok: false, error: r.erreur };
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: r };
  } catch (err) {
    const message = messageErreurContrainte(err, { unicite: MESSAGE_DOUBLON });
    if (message) return { ok: false, error: message };
    throw err;
  }
}
