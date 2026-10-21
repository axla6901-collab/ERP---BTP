'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhAnnonces, sirhEquipes, sirhSites } from '@/db/schema/test-sirh';
import {
  annonceSchema,
  epingleAnnonceSchema,
  type AnnonceInput,
  type EpingleAnnonceInput,
} from '@/lib/validation/test-sirh/annonces';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/**
 * Server actions — Test SIRH › Annonces (communication interne, Factorial
 * posts). Écriture réservée aux gestionnaires RH ; le fil est lu par tous.
 */

function invalide(error: { flatten: () => { fieldErrors: unknown } }): ActionResult<never> {
  return {
    ok: false,
    error: 'Données invalides.',
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

/** Colonnes métier d'une annonce, dérivées de l'input validé. */
function colonnesAnnonce(data: AnnonceInput) {
  return {
    titre: data.titre,
    contenu: data.contenu,
    categorie: data.categorie,
    epinglee: data.epinglee,
    publiee: data.publiee,
    datePublication: data.datePublication,
    dateExpiration: data.dateExpiration,
    siteId: data.siteId,
    equipeId: data.equipeId,
  };
}

/** Crée (sans `id`, auteur = utilisateur courant) ou met à jour (avec `id`) une annonce. */
export async function enregistrerAnnonce(
  input: AnnonceInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = annonceSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const data = parsed.data;
  const colonnes = colonnesAnnonce(data);

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      // Isolation tenant : les FK ignorent la RLS, on vérifie l'audience par un select.
      if (data.siteId) {
        const [site] = await tx
          .select({ id: sirhSites.id })
          .from(sirhSites)
          .where(and(eq(sirhSites.id, data.siteId), isNull(sirhSites.deletedAt)));
        if (!site) return { type: 'erreur' as const, message: 'Site introuvable.' };
      }
      if (data.equipeId) {
        const [equipe] = await tx
          .select({ id: sirhEquipes.id })
          .from(sirhEquipes)
          .where(and(eq(sirhEquipes.id, data.equipeId), isNull(sirhEquipes.deletedAt)));
        if (!equipe) return { type: 'erreur' as const, message: 'Équipe introuvable.' };
      }

      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhAnnonces)
          .where(and(eq(sirhAnnonces.id, data.id), isNull(sirhAnnonces.deletedAt)));
        if (!before) return { type: 'erreur' as const, message: 'Annonce introuvable.' };
        await tx
          .update(sirhAnnonces)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhAnnonces.id, before.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_annonces',
          rowId: before.id,
          before,
          after: colonnes,
        });
        return { type: 'ok' as const, id: before.id };
      }

      const [inseree] = await tx
        .insert(sirhAnnonces)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          auteurId: ctx.utilisateur.id,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhAnnonces.id });
      if (!inseree) throw new Error('INSERT sirh_annonces échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_annonces',
        rowId: inseree.id,
        after: { ...colonnes, auteurId: ctx.utilisateur.id },
      });
      return { type: 'ok' as const, id: inseree.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Dates incohérentes : l’expiration doit suivre la publication.',
      reference: 'Site ou équipe introuvable.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Épingle (en tête du fil) ou désépingle une annonce. */
export async function basculerEpingleAnnonce(input: EpingleAnnonceInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = epingleAnnonceSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const { id, epinglee } = parsed.data;

  const trouvee = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhAnnonces)
      .where(and(eq(sirhAnnonces.id, id), isNull(sirhAnnonces.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhAnnonces)
      .set({ epinglee, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhAnnonces.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_annonces',
      rowId: id,
      before,
      after: { epinglee },
    });
    return true;
  });

  if (!trouvee) return { ok: false, error: 'Annonce introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/** Supprime (soft-delete) une annonce (aucune autre entité ne la référence). */
export async function supprimerAnnonce(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!uuidRequis().safeParse(id).success) return { ok: false, error: 'Annonce introuvable.' };

  const supprimee = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhAnnonces)
      .where(and(eq(sirhAnnonces.id, id), isNull(sirhAnnonces.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhAnnonces)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhAnnonces.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_annonces', rowId: id, before });
    return true;
  });

  if (!supprimee) return { ok: false, error: 'Annonce introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}
