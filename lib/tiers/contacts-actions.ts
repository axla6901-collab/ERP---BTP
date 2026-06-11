'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { fournisseurContacts, fournisseurs } from '@/db/schema/catalogue';
import { clientContacts, clients } from '@/db/schema/commercial';
import { sousTraitantContacts, sousTraitants } from '@/db/schema/tiers';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { ROLES_COMMERCIAL_WRITE } from '@/lib/commercial/permissions';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import type { SourceContact } from '@/lib/tiers/contacts-annuaire';
import {
  contactSchema,
  creerContactSchema,
  type ContactInput,
  type CreerContactInput,
} from '@/lib/validation/tiers';

import { ROLES_TIERS_WRITE } from './permissions';
import type { ActionResult } from './types';

/** Sources de contacts éditables via le toggle de statut de l'annuaire. */
export type SourceContactEditable = 'fournisseur' | 'sous_traitant';

// ─────────────────────────────────────────────────────────────
// Helpers partagés (non exportés : un module 'use server' n'exporte que des
// fonctions async). Aiguillent les trois tables de contacts par `source`.
// ─────────────────────────────────────────────────────────────

/** Mutation contacts client = droit commercial ; sinon droit tiers. */
function rolesPourSource(source: SourceContact) {
  return source === 'client' ? ROLES_COMMERCIAL_WRITE : ROLES_TIERS_WRITE;
}

function tableNomPourSource(source: SourceContact): string {
  if (source === 'fournisseur') return 'fournisseur_contacts';
  if (source === 'sous_traitant') return 'sous_traitant_contacts';
  return 'client_contacts';
}

function revaliderContact(slug: string, source: SourceContact, tiersId: string): void {
  revalidatePath(`/${slug}/tiers/contacts`);
  if (source === 'fournisseur') {
    revalidatePath(`/${slug}/tiers/fournisseurs`);
    revalidatePath(`/${slug}/tiers/fournisseurs/${tiersId}`);
  } else if (source === 'sous_traitant') {
    revalidatePath(`/${slug}/tiers/sous-traitants`);
    revalidatePath(`/${slug}/tiers/sous-traitants/${tiersId}`);
  } else {
    revalidatePath(`/${slug}/commercial/clients`);
    revalidatePath(`/${slug}/commercial/clients/${tiersId}`);
  }
}

/** Vérifie que le tiers de rattachement existe (et n'est pas soft-deleted). */
async function verifierTiers(
  tx: TenantTx,
  source: SourceContact,
  tiersId: string,
): Promise<boolean> {
  if (source === 'fournisseur') {
    const [p] = await tx
      .select({ id: fournisseurs.id })
      .from(fournisseurs)
      .where(and(eq(fournisseurs.id, tiersId), isNull(fournisseurs.deletedAt)));
    return Boolean(p);
  }
  if (source === 'sous_traitant') {
    const [p] = await tx
      .select({ id: sousTraitants.id })
      .from(sousTraitants)
      .where(and(eq(sousTraitants.id, tiersId), isNull(sousTraitants.deletedAt)));
    return Boolean(p);
  }
  const [p] = await tx
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, tiersId), isNull(clients.deletedAt)));
  return Boolean(p);
}

/** Retire le rôle « principal » de tous les contacts actifs d'un tiers. */
async function retirerPrincipaux(
  tx: TenantTx,
  source: SourceContact,
  tiersId: string,
  userId: string,
): Promise<void> {
  if (source === 'fournisseur') {
    await tx
      .update(fournisseurContacts)
      .set({ principal: false, updatedBy: userId })
      .where(
        and(
          eq(fournisseurContacts.fournisseurId, tiersId),
          eq(fournisseurContacts.principal, true),
          isNull(fournisseurContacts.deletedAt),
        ),
      );
    return;
  }
  if (source === 'sous_traitant') {
    await tx
      .update(sousTraitantContacts)
      .set({ principal: false, updatedBy: userId })
      .where(
        and(
          eq(sousTraitantContacts.sousTraitantId, tiersId),
          eq(sousTraitantContacts.principal, true),
          isNull(sousTraitantContacts.deletedAt),
        ),
      );
    return;
  }
  await tx
    .update(clientContacts)
    .set({ principal: false, updatedBy: userId })
    .where(
      and(
        eq(clientContacts.clientId, tiersId),
        eq(clientContacts.principal, true),
        isNull(clientContacts.deletedAt),
      ),
    );
}

/** Charge un contact (non supprimé) et le tiers auquel il est rattaché. */
async function chargerContact(tx: TenantTx, source: SourceContact, contactId: string) {
  if (source === 'fournisseur') {
    const [r] = await tx
      .select()
      .from(fournisseurContacts)
      .where(and(eq(fournisseurContacts.id, contactId), isNull(fournisseurContacts.deletedAt)));
    return r ? { tiersId: r.fournisseurId, before: r } : null;
  }
  if (source === 'sous_traitant') {
    const [r] = await tx
      .select()
      .from(sousTraitantContacts)
      .where(and(eq(sousTraitantContacts.id, contactId), isNull(sousTraitantContacts.deletedAt)));
    return r ? { tiersId: r.sousTraitantId, before: r } : null;
  }
  const [r] = await tx
    .select()
    .from(clientContacts)
    .where(and(eq(clientContacts.id, contactId), isNull(clientContacts.deletedAt)));
  return r ? { tiersId: r.clientId, before: r } : null;
}

// ─────────────────────────────────────────────────────────────
// Toggle statut (annuaire consolidé)
// ─────────────────────────────────────────────────────────────

/**
 * Bascule le statut actif/inactif d'un contact de tiers depuis l'annuaire
 * consolidé (ou ailleurs). Désactiver un contact le retire automatiquement du
 * rôle « principal » — cohérent avec l'index unique partiel et la frame de
 * création/édition, qui interdisent un principal inactif. Idempotente.
 *
 * Les contacts « client » de l'annuaire ne passent pas par ici : leur statut se
 * gère depuis la fiche client (frame d'édition).
 */
export async function changerStatutContact(
  source: SourceContactEditable,
  contactId: string,
  actif: boolean,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      // Désactiver retire le rôle principal ; réactiver ne le rétablit pas.
      const principalCible = actif ? undefined : false;

      if (source === 'fournisseur') {
        const [before] = await tx
          .select()
          .from(fournisseurContacts)
          .where(and(eq(fournisseurContacts.id, contactId), isNull(fournisseurContacts.deletedAt)));
        if (!before) throw new Error('NOT_FOUND');
        const principal = principalCible ?? before.principal;
        if (before.actif === actif && before.principal === principal) return;
        await tx
          .update(fournisseurContacts)
          .set({ actif, principal, updatedBy: ctx.utilisateur.id })
          .where(eq(fournisseurContacts.id, contactId));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'fournisseur_contacts',
          rowId: contactId,
          before,
          after: { ...before, actif, principal },
        });
      } else {
        const [before] = await tx
          .select()
          .from(sousTraitantContacts)
          .where(
            and(eq(sousTraitantContacts.id, contactId), isNull(sousTraitantContacts.deletedAt)),
          );
        if (!before) throw new Error('NOT_FOUND');
        const principal = principalCible ?? before.principal;
        if (before.actif === actif && before.principal === principal) return;
        await tx
          .update(sousTraitantContacts)
          .set({ actif, principal, updatedBy: ctx.utilisateur.id })
          .where(eq(sousTraitantContacts.id, contactId));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sous_traitant_contacts',
          rowId: contactId,
          before,
          after: { ...before, actif, principal },
        });
      }
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/contacts`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Contact introuvable.' };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// CRUD contact (frame ContactDialog : annuaire + fiches des tiers)
// ─────────────────────────────────────────────────────────────

/**
 * Crée un contact via la frame `ContactDialog`, rattaché à un fournisseur, un
 * sous-traitant ou un client. Mêmes règles métier que partout : unicité du
 * contact principal actif par tiers (garantie aussi par l'index unique partiel),
 * un contact inactif ne peut pas être principal. Enregistrement immédiat.
 */
export async function creerContact(
  input: CreerContactInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = creerContactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { source, tiersId, ...contact } = parsed.data;
  const ctx = await requireTenantContextWithMfa(rolesPourSource(source));
  // Un contact inactif ne peut pas être « principal » (cohérent avec l'index
  // unique partiel et la frame d'édition).
  const enPrincipal = contact.principal && contact.actif;

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      if (!(await verifierTiers(tx, source, tiersId))) throw new Error('TIERS_NOT_FOUND');
      if (enPrincipal) await retirerPrincipaux(tx, source, tiersId, ctx.utilisateur.id);

      let insertedId: string;
      if (source === 'fournisseur') {
        const [r] = await tx
          .insert(fournisseurContacts)
          .values({
            entrepriseId: ctx.entreprise.id,
            fournisseurId: tiersId,
            nom: contact.nom,
            prenom: contact.prenom,
            fonction: contact.fonction,
            email: contact.email,
            telephoneMobile: contact.telephoneMobile,
            telephoneFixe: contact.telephoneFixe,
            notes: contact.notes,
            principal: enPrincipal,
            actif: contact.actif,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: fournisseurContacts.id });
        if (!r) throw new Error('INSERT failed');
        insertedId = r.id;
      } else if (source === 'sous_traitant') {
        const [r] = await tx
          .insert(sousTraitantContacts)
          .values({
            entrepriseId: ctx.entreprise.id,
            sousTraitantId: tiersId,
            nom: contact.nom,
            prenom: contact.prenom,
            fonction: contact.fonction,
            email: contact.email,
            telephoneMobile: contact.telephoneMobile,
            telephoneFixe: contact.telephoneFixe,
            notes: contact.notes,
            principal: enPrincipal,
            actif: contact.actif,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sousTraitantContacts.id });
        if (!r) throw new Error('INSERT failed');
        insertedId = r.id;
      } else {
        const [r] = await tx
          .insert(clientContacts)
          .values({
            entrepriseId: ctx.entreprise.id,
            clientId: tiersId,
            nom: contact.nom,
            prenom: contact.prenom,
            fonction: contact.fonction,
            email: contact.email,
            telephoneMobile: contact.telephoneMobile,
            telephoneFixe: contact.telephoneFixe,
            notes: contact.notes,
            principal: enPrincipal,
            actif: contact.actif,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: clientContacts.id });
        if (!r) throw new Error('INSERT failed');
        insertedId = r.id;
      }

      await auditLogIn(tx, {
        action: 'insert',
        tableName: tableNomPourSource(source),
        rowId: insertedId,
        after: { ...contact, principal: enPrincipal, source, tiersId },
      });
      return insertedId;
    });

    revaliderContact(ctx.entreprise.slug, source, tiersId);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && err.message === 'TIERS_NOT_FOUND') {
      return { ok: false, error: 'Tiers de rattachement introuvable.' };
    }
    throw err;
  }
}

/**
 * Met à jour un contact existant via la frame `ContactDialog`. Si le contact
 * devient principal, le rôle est d'abord retiré aux autres contacts du tiers
 * (et à lui-même) pour ne pas violer l'index unique partiel.
 */
export async function mettreAJourContact(
  source: SourceContact,
  contactId: string,
  input: ContactInput,
): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const contact = parsed.data;
  const enPrincipal = contact.principal && contact.actif;
  const ctx = await requireTenantContextWithMfa(rolesPourSource(source));

  try {
    const tiersId = await withTenant(ctx.entreprise.id, async (tx) => {
      const courant = await chargerContact(tx, source, contactId);
      if (!courant) throw new Error('NOT_FOUND');
      if (enPrincipal) await retirerPrincipaux(tx, source, courant.tiersId, ctx.utilisateur.id);

      const set = {
        nom: contact.nom,
        prenom: contact.prenom,
        fonction: contact.fonction,
        email: contact.email,
        telephoneMobile: contact.telephoneMobile,
        telephoneFixe: contact.telephoneFixe,
        notes: contact.notes,
        actif: contact.actif,
        principal: enPrincipal,
        updatedBy: ctx.utilisateur.id,
      };
      if (source === 'fournisseur') {
        await tx.update(fournisseurContacts).set(set).where(eq(fournisseurContacts.id, contactId));
      } else if (source === 'sous_traitant') {
        await tx
          .update(sousTraitantContacts)
          .set(set)
          .where(eq(sousTraitantContacts.id, contactId));
      } else {
        await tx.update(clientContacts).set(set).where(eq(clientContacts.id, contactId));
      }

      await auditLogIn(tx, {
        action: 'update',
        tableName: tableNomPourSource(source),
        rowId: contactId,
        before: courant.before,
        after: { ...contact, principal: enPrincipal },
      });
      return courant.tiersId;
    });
    revaliderContact(ctx.entreprise.slug, source, tiersId);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Contact introuvable.' };
    }
    throw err;
  }
}

/**
 * Supprime (soft-delete) un contact. Un contact est une entité « feuille » :
 * aucune table ne le référence (les FK pointent vers le tiers, pas le contact),
 * donc le garde-fou de suppression référentielle ne s'applique pas. Idempotente.
 */
export async function supprimerContact(
  source: SourceContact,
  contactId: string,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(rolesPourSource(source));
  const tiersId = await withTenant(ctx.entreprise.id, async (tx) => {
    const courant = await chargerContact(tx, source, contactId);
    if (!courant) return null; // déjà absent → suppression idempotente

    const set = {
      deletedAt: new Date(),
      actif: false,
      principal: false,
      updatedBy: ctx.utilisateur.id,
    };
    if (source === 'fournisseur') {
      await tx.update(fournisseurContacts).set(set).where(eq(fournisseurContacts.id, contactId));
    } else if (source === 'sous_traitant') {
      await tx.update(sousTraitantContacts).set(set).where(eq(sousTraitantContacts.id, contactId));
    } else {
      await tx.update(clientContacts).set(set).where(eq(clientContacts.id, contactId));
    }

    await auditLogIn(tx, {
      action: 'delete',
      tableName: tableNomPourSource(source),
      rowId: contactId,
      before: courant.before,
    });
    return courant.tiersId;
  });

  if (tiersId) revaliderContact(ctx.entreprise.slug, source, tiersId);
  return { ok: true, data: undefined };
}
