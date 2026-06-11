'use server';

import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import {
  sousTraitantContacts,
  sousTraitants,
  type SousTraitant,
  type SousTraitantContact,
} from '@/db/schema/tiers';
import { compteProrataParticipants } from '@/db/schema/compte-prorata';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { sousTraitantSchema, type SousTraitantInput } from '@/lib/validation/tiers';

import { ROLES_TIERS_WRITE } from './permissions';
import type { ActionResult } from './types';

export type SousTraitantAvecCompteurs = SousTraitant & {
  contactsActifs: number;
  contactsTotal: number;
};

export async function listerSousTraitants(): Promise<SousTraitantAvecCompteurs[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sousTraitants.id,
        entrepriseId: sousTraitants.entrepriseId,
        code: sousTraitants.code,
        nom: sousTraitants.nom,
        parentStId: sousTraitants.parentStId,
        tierId: sousTraitants.tierId,
        tauxRetenueGarantie: sousTraitants.tauxRetenueGarantie,
        siret: sousTraitants.siret,
        nTvaIntra: sousTraitants.nTvaIntra,
        email: sousTraitants.email,
        telephone: sousTraitants.telephone,
        adresseLigne1: sousTraitants.adresseLigne1,
        adresseLigne2: sousTraitants.adresseLigne2,
        codePostal: sousTraitants.codePostal,
        ville: sousTraitants.ville,
        pays: sousTraitants.pays,
        assuranceDecennaleNum: sousTraitants.assuranceDecennaleNum,
        assuranceDecennaleDateFin: sousTraitants.assuranceDecennaleDateFin,
        qualifications: sousTraitants.qualifications,
        agrementDc4: sousTraitants.agrementDc4,
        dateAttestationUrssaf: sousTraitants.dateAttestationUrssaf,
        statut: sousTraitants.statut,
        actif: sousTraitants.actif,
        dateSortie: sousTraitants.dateSortie,
        createdAt: sousTraitants.createdAt,
        updatedAt: sousTraitants.updatedAt,
        createdBy: sousTraitants.createdBy,
        updatedBy: sousTraitants.updatedBy,
        deletedAt: sousTraitants.deletedAt,
        contactsActifs: sql<number>`
          (SELECT COUNT(*)::int FROM sous_traitant_contacts c
           WHERE c.sous_traitant_id = sous_traitants.id
             AND c.deleted_at IS NULL
             AND c.actif = true)
        `,
        contactsTotal: sql<number>`
          (SELECT COUNT(*)::int FROM sous_traitant_contacts c
           WHERE c.sous_traitant_id = sous_traitants.id
             AND c.deleted_at IS NULL)
        `,
      })
      .from(sousTraitants)
      .where(isNull(sousTraitants.deletedAt))
      .orderBy(asc(sousTraitants.nom)),
  );
  return rows;
}

export async function lireSousTraitant(id: string): Promise<SousTraitant | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(sousTraitants)
      .where(and(eq(sousTraitants.id, id), isNull(sousTraitants.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}

export async function listerSousTraitantContacts(
  sousTraitantId: string,
): Promise<SousTraitantContact[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(sousTraitantContacts)
      .where(
        and(
          eq(sousTraitantContacts.sousTraitantId, sousTraitantId),
          isNull(sousTraitantContacts.deletedAt),
        ),
      )
      .orderBy(
        sql`${sousTraitantContacts.principal} DESC, ${sousTraitantContacts.actif} DESC, ${sousTraitantContacts.nom} ASC`,
      ),
  );
}

export async function creerSousTraitant(
  input: SousTraitantInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  const parsed = sousTraitantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(sousTraitants)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          nom: parsed.data.nom,
          parentStId: parsed.data.parentStId,
          tauxRetenueGarantie: parsed.data.tauxRetenueGarantie,
          siret: parsed.data.siret,
          nTvaIntra: parsed.data.nTvaIntra,
          email: parsed.data.email,
          telephone: parsed.data.telephone,
          adresseLigne1: parsed.data.adresseLigne1,
          adresseLigne2: parsed.data.adresseLigne2,
          codePostal: parsed.data.codePostal,
          ville: parsed.data.ville,
          pays: parsed.data.pays,
          assuranceDecennaleNum: parsed.data.assuranceDecennaleNum,
          assuranceDecennaleDateFin: parsed.data.assuranceDecennaleDateFin,
          qualifications: parsed.data.qualifications,
          agrementDc4: parsed.data.agrementDc4,
          dateAttestationUrssaf: parsed.data.dateAttestationUrssaf,
          statut: parsed.data.statut,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sousTraitants.id });
      if (!inserted) throw new Error('INSERT failed');

      // Les contacts ne sont plus saisis ici : ils s'ajoutent depuis la fiche
      // via la frame ContactDialog (server actions lib/tiers/contacts-actions.ts).

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sous_traitants',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers`);
    return { ok: true, data: { id } };
  } catch (err) {
    const blocage = messageBlocageCascadeST(err);
    if (blocage) return { ok: false, error: blocage, fieldErrors: { parentStId: [blocage] } };
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" ou le SIRET existe déjà.` };
    }
    throw err;
  }
}

export async function mettreAJourSousTraitant(
  id: string,
  input: SousTraitantInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  const parsed = sousTraitantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(sousTraitants)
        .where(and(eq(sousTraitants.id, id), isNull(sousTraitants.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(sousTraitants)
        .set({
          code: parsed.data.code,
          nom: parsed.data.nom,
          parentStId: parsed.data.parentStId,
          tauxRetenueGarantie: parsed.data.tauxRetenueGarantie,
          siret: parsed.data.siret,
          nTvaIntra: parsed.data.nTvaIntra,
          email: parsed.data.email,
          telephone: parsed.data.telephone,
          adresseLigne1: parsed.data.adresseLigne1,
          adresseLigne2: parsed.data.adresseLigne2,
          codePostal: parsed.data.codePostal,
          ville: parsed.data.ville,
          pays: parsed.data.pays,
          assuranceDecennaleNum: parsed.data.assuranceDecennaleNum,
          assuranceDecennaleDateFin: parsed.data.assuranceDecennaleDateFin,
          qualifications: parsed.data.qualifications,
          agrementDc4: parsed.data.agrementDc4,
          dateAttestationUrssaf: parsed.data.dateAttestationUrssaf,
          statut: parsed.data.statut,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(sousTraitants.id, id));

      // Les contacts se gèrent depuis la fiche via la frame ContactDialog
      // (enregistrement immédiat) — plus de diff de contacts ici.

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sous_traitants',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Sous-traitant introuvable.' };
    }
    const blocage = messageBlocageCascadeST(err);
    if (blocage) return { ok: false, error: blocage, fieldErrors: { parentStId: [blocage] } };
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code ou le SIRET existe déjà.` };
    }
    throw err;
  }
}

/**
 * Traduit une erreur du trigger `trg_st_anti_cycle` / de la contrainte
 * `chk_sous_traitants_parent_self` (migration 0061) en message utilisateur.
 * Renvoie null si l'erreur n'est pas liée à la cascade.
 */
function messageBlocageCascadeST(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const m = err.message;
  if (/chk_sous_traitants_parent_self/i.test(m) || /\bcycle\b/i.test(m)) {
    return 'Cascade invalide : un sous-traitant ne peut être son propre parent ni créer un cycle.';
  }
  if (/3 niveaux|cascade de sous-traitance/i.test(m)) {
    return 'Cascade limitée à 3 niveaux de sous-traitance.';
  }
  if (/parent.*introuvable|autre entreprise/i.test(m)) {
    return 'Sous-traitant parent invalide (introuvable ou hors entreprise).';
  }
  return null;
}

/**
 * Bascule le statut actif/inactif d'un sous-traitant sans ouvrir le formulaire
 * complet. Idempotente. Réutilisée par la liste et le bandeau de la fiche.
 */
export async function changerStatutSousTraitant(id: string, actif: boolean): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(sousTraitants)
        .where(and(eq(sousTraitants.id, id), isNull(sousTraitants.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      if (before.actif === actif) return; // déjà dans l'état voulu
      // La contrainte chk_sous_traitants_actif_date couple actif et date_sortie :
      // actif ⟺ date_sortie NULL, inactif ⟺ date_sortie renseignée. On les met
      // donc à jour ensemble (date du jour à la désactivation, NULL à la réactivation).
      const dateSortie = actif ? null : new Date().toISOString().slice(0, 10);
      await tx
        .update(sousTraitants)
        .set({ actif, dateSortie, updatedBy: ctx.utilisateur.id })
        .where(eq(sousTraitants.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sous_traitants',
        rowId: id,
        before,
        after: { ...before, actif, dateSortie },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants/${id}`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/contacts`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Sous-traitant introuvable.' };
    }
    throw err;
  }
}

export async function supprimerSousTraitant(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sousTraitants)
      .where(and(eq(sousTraitants.id, id), isNull(sousTraitants.deletedAt)));
    if (!before) return null;

    // FK ON DELETE RESTRICT depuis compte_prorata_participants : un ST référencé
    // par un participant actif d'un compte prorata ne peut pas être supprimé.
    const [cpp] = await tx
      .select({ n: count() })
      .from(compteProrataParticipants)
      .where(
        and(
          eq(compteProrataParticipants.sousTraitantId, id),
          isNull(compteProrataParticipants.deletedAt),
        ),
      );
    const message = messageBlocageSuppression('ce sous-traitant', [
      { nombre: cpp?.n ?? 0, singulier: 'compte prorata', pluriel: 'comptes prorata' },
    ]);
    if (message) return message;

    await tx
      .update(sousTraitants)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sousTraitants.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sous_traitants',
      rowId: id,
      before,
    });
    return null;
  });
  if (blocage) return { ok: false, error: blocage };
  revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants`);
  return { ok: true, data: undefined };
}
