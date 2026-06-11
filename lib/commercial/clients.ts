'use server';

import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import {
  clientContacts,
  clients,
  devis,
  type Client,
  type ClientContact,
} from '@/db/schema/commercial';
import { chantiers } from '@/db/schema/chantiers';
import { factures } from '@/db/schema/facturation';
import { clientSchema, type ClientInput } from '@/lib/validation/commercial';

import { ROLES_COMMERCIAL_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

export async function listerClients(): Promise<Client[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx.select().from(clients).where(isNull(clients.deletedAt)).orderBy(asc(clients.code)),
  );
}

export async function lireClient(id: string): Promise<Client | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), isNull(clients.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}

export async function listerClientContacts(clientId: string): Promise<ClientContact[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, clientId), isNull(clientContacts.deletedAt)))
      .orderBy(
        // Principaux en premier, puis actifs, puis par nom.
        sql`${clientContacts.principal} DESC, ${clientContacts.actif} DESC, ${clientContacts.nom} ASC`,
      ),
  );
}

export async function creerClient(input: ClientInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_COMMERCIAL_WRITE);
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(clients)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          type: parsed.data.type,
          raisonSociale: parsed.data.raisonSociale ?? null,
          nom: parsed.data.nom ?? null,
          prenom: parsed.data.prenom ?? null,
          siret: parsed.data.siret ?? null,
          tvaIntra: parsed.data.tvaIntra ?? null,
          email: parsed.data.email,
          telephone: parsed.data.telephone,
          adresseLigne1: parsed.data.adresseLigne1,
          adresseLigne2: parsed.data.adresseLigne2,
          codePostal: parsed.data.codePostal,
          ville: parsed.data.ville,
          pays: parsed.data.pays,
          notes: parsed.data.notes,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: clients.id });
      if (!inserted) throw new Error('INSERT failed');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'clients',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/commercial/clients`);
    revalidatePath(`/${ctx.entreprise.slug}/commercial`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" ou le SIRET existe déjà.` };
    }
    throw err;
  }
}

export async function mettreAJourClient(id: string, input: ClientInput): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_COMMERCIAL_WRITE);
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, id), isNull(clients.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(clients)
        .set({
          code: parsed.data.code,
          type: parsed.data.type,
          raisonSociale: parsed.data.raisonSociale ?? null,
          nom: parsed.data.nom ?? null,
          prenom: parsed.data.prenom ?? null,
          siret: parsed.data.siret ?? null,
          tvaIntra: parsed.data.tvaIntra ?? null,
          email: parsed.data.email,
          telephone: parsed.data.telephone,
          adresseLigne1: parsed.data.adresseLigne1,
          adresseLigne2: parsed.data.adresseLigne2,
          codePostal: parsed.data.codePostal,
          ville: parsed.data.ville,
          pays: parsed.data.pays,
          notes: parsed.data.notes,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(clients.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'clients',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/commercial/clients`);
    revalidatePath(`/${ctx.entreprise.slug}/commercial/clients/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Client introuvable.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" ou le SIRET existe déjà.` };
    }
    throw err;
  }
}

export async function supprimerClient(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_COMMERCIAL_WRITE);
  // Soft-delete : la suppression ne fait que poser `deleted_at`, elle ne déclenche
  // donc aucune contrainte FK. Le garde-fou « supprimable seulement s'il
  // n'apparaît nulle part ailleurs » est appliqué explicitement ici, dans la
  // même transaction que la suppression (lecture/écriture atomique).
  const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), isNull(clients.deletedAt)));
    if (!before) return null; // déjà absent → suppression idempotente

    // Toutes les lignes comptent, archivées comprises : un document historisé
    // référence toujours le client (cohérence des archives).
    const [rDevis] = await tx.select({ n: count() }).from(devis).where(eq(devis.clientId, id));
    const [rFactures] = await tx
      .select({ n: count() })
      .from(factures)
      .where(eq(factures.clientId, id));
    const [rChantiers] = await tx
      .select({ n: count() })
      .from(chantiers)
      .where(eq(chantiers.clientId, id));

    const message = messageBlocageSuppression('ce client', [
      { nombre: rDevis?.n ?? 0, singulier: 'devis', pluriel: 'devis' },
      { nombre: rFactures?.n ?? 0, singulier: 'facture', pluriel: 'factures' },
      { nombre: rChantiers?.n ?? 0, singulier: 'chantier', pluriel: 'chantiers' },
    ]);
    if (message) return message;

    await tx
      .update(clients)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(clients.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'clients',
      rowId: id,
      before,
    });
    return null;
  });

  if (blocage) return { ok: false, error: blocage };
  revalidatePath(`/${ctx.entreprise.slug}/commercial/clients`);
  return { ok: true, data: undefined };
}
