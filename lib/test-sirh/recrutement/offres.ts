'use server';

import { and, count, eq, isNull } from 'drizzle-orm';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { sirhCandidatures, sirhOffres, sirhPostes, sirhSites } from '@/db/schema/test-sirh';
import { LIBELLES_STATUT_OFFRE, type StatutOffre } from '@/lib/validation/test-sirh/enums';
import {
  changementStatutOffreSchema,
  offreSchema,
  type ChangementStatutOffreInput,
  type OffreInput,
} from '@/lib/validation/test-sirh/recrutement';

import { employeExiste } from '../acces';
import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';
import { estUuid, revaliderRecrutement } from './commun-serveur';
import { datesOffrePourStatut, transitionStatutOffreAutorisee } from './pipeline';

/**
 * Server actions — Test SIRH › Recrutement › Offres d'emploi (Factorial
 * ats/JobPosting). Réservées à la gestion RH (admin, RH).
 */

const MESSAGE_REFERENCE_DOUBLON = 'Une offre porte déjà cette référence.';

/** Vérifie que le poste, le site et le responsable référencés existent dans le tenant. */
async function verifierReferencesOffre(tx: TenantTx, data: OffreInput): Promise<string | null> {
  if (data.posteId) {
    const [poste] = await tx
      .select({ id: sirhPostes.id })
      .from(sirhPostes)
      .where(and(eq(sirhPostes.id, data.posteId), isNull(sirhPostes.deletedAt)));
    if (!poste) return 'Poste introuvable.';
  }
  if (data.siteId) {
    const [site] = await tx
      .select({ id: sirhSites.id })
      .from(sirhSites)
      .where(and(eq(sirhSites.id, data.siteId), isNull(sirhSites.deletedAt)));
    if (!site) return 'Site introuvable.';
  }
  if (data.responsableId && !(await employeExiste(tx, data.responsableId))) {
    return 'Responsable du recrutement introuvable.';
  }
  return null;
}

/** Crée (sans `id`) ou met à jour (avec `id`) une offre d'emploi. */
export async function enregistrerOffre(input: OffreInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = offreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const today = aujourdhuiIso();

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const erreurReference = await verifierReferencesOffre(tx, data);
      if (erreurReference) return { type: 'erreur' as const, message: erreurReference };

      const colonnes = {
        reference: data.reference,
        titre: data.titre,
        posteId: data.posteId,
        siteId: data.siteId,
        typeContrat: data.typeContrat,
        description: data.description,
        profilRecherche: data.profilRecherche,
        nbPostes: data.nbPostes,
        salaireMin: data.salaireMin,
        salaireMax: data.salaireMax,
        statut: data.statut,
        datePublication: data.datePublication,
        dateCloture: data.dateCloture,
        responsableId: data.responsableId,
      };

      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhOffres)
          .where(and(eq(sirhOffres.id, data.id), isNull(sirhOffres.deletedAt)));
        if (!before) return { type: 'erreur' as const, message: 'Offre introuvable.' };
        // Dates complétées seulement si le statut change (republication, clôture…).
        const dates =
          before.statut === data.statut
            ? { datePublication: data.datePublication, dateCloture: data.dateCloture }
            : datesOffrePourStatut(data.statut, data, today);
        const after = { ...colonnes, ...dates };
        await tx
          .update(sirhOffres)
          .set({ ...after, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhOffres.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_offres',
          rowId: data.id,
          before,
          after,
        });
        return { type: 'ok' as const, id: data.id };
      }

      const after = { ...colonnes, ...datesOffrePourStatut(data.statut, data, today) };
      const [inserted] = await tx
        .insert(sirhOffres)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...after,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhOffres.id });
      if (!inserted) throw new Error('INSERT sirh_offres échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_offres',
        rowId: inserted.id,
        after,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderRecrutement(ctx);
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: MESSAGE_REFERENCE_DOUBLON,
      controle: 'Offre incohérente (salaires ou dates).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Change le statut d'une offre selon les transitions autorisées (dates complétées). */
export async function changerStatutOffre(
  input: ChangementStatutOffreInput,
): Promise<ActionResult<{ statut: StatutOffre }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = changementStatutOffreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { id, statut } = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhOffres)
      .where(and(eq(sirhOffres.id, id), isNull(sirhOffres.deletedAt)));
    if (!before) return { type: 'erreur' as const, message: 'Offre introuvable.' };
    if (!transitionStatutOffreAutorisee(before.statut, statut)) {
      return {
        type: 'erreur' as const,
        message: `Passage « ${LIBELLES_STATUT_OFFRE[before.statut]} » → « ${LIBELLES_STATUT_OFFRE[statut]} » non autorisé.`,
      };
    }
    const after = { statut, ...datesOffrePourStatut(statut, before, aujourdhuiIso()) };
    await tx
      .update(sirhOffres)
      .set({ ...after, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhOffres.id, id));
    await auditLogIn(tx, { action: 'update', tableName: 'sirh_offres', rowId: id, before, after });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderRecrutement(ctx);
  return { ok: true, data: { statut } };
}

/**
 * Suppression (soft-delete). Refusée si l'offre a des candidatures
 * (suppression référentielle) — la fermer plutôt.
 */
export async function supprimerOffre(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!estUuid(id)) return { ok: false, error: 'Offre introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhOffres)
      .where(and(eq(sirhOffres.id, id), isNull(sirhOffres.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const [candidatures] = await tx
      .select({ n: count() })
      .from(sirhCandidatures)
      .where(and(eq(sirhCandidatures.offreId, id), isNull(sirhCandidatures.deletedAt)));
    const blocage = messageBlocageSuppression(
      'cette offre',
      [{ nombre: candidatures?.n ?? 0, singulier: 'candidature', pluriel: 'candidatures' }],
      { feminin: true },
    );
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(sirhOffres)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhOffres.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_offres', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Offre introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revaliderRecrutement(ctx);
  return { ok: true, data: undefined };
}
