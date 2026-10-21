'use server';

import { and, asc, count, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLog } from '@/db/schema/audit';
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
import { raisonsSociales } from '@/db/schema/raisons-sociales';
import { utilisateurs } from '@/db/schema/utilisateurs';
import { getOrCreateRaisonSocialeId } from '@/lib/referencement/raison-sociale-resolver';
import { clientSchema, type ClientInput } from '@/lib/validation/commercial';

import { ROLES_COMMERCIAL_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

/**
 * Client enrichi du nom lu depuis le référentiel central (`raisons_sociales`).
 * La raison sociale n'est plus stockée en texte sur `clients` : elle est lue
 * via jointure sur `raison_sociale_id` et exposée sous `raisonSociale` (alias)
 * pour rester compatible avec tout le code d'affichage existant.
 */
export type ClientAvecRaisonSociale = Client & { raisonSociale: string | null };

export async function listerClients(): Promise<ClientAvecRaisonSociale[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ ...getTableColumns(clients), raisonSociale: raisonsSociales.raisonSociale })
      .from(clients)
      .leftJoin(raisonsSociales, eq(raisonsSociales.id, clients.raisonSocialeId))
      .where(isNull(clients.deletedAt))
      .orderBy(asc(clients.code)),
  );
}

export async function lireClient(id: string): Promise<ClientAvecRaisonSociale | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ ...getTableColumns(clients), raisonSociale: raisonsSociales.raisonSociale })
      .from(clients)
      .leftJoin(raisonsSociales, eq(raisonsSociales.id, clients.raisonSocialeId))
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

/**
 * Une opération commerciale rattachée au client (devis ou chantier), projetée
 * pour le bloc « Activité commerciale » (zone E) et la synthèse du rail.
 * `statut` est la valeur brute de l'enum (libellé / ton résolus côté page).
 */
export type ActiviteClientItem = {
  id: string;
  type: 'devis' | 'chantier';
  ref: string;
  objet: string | null;
  /** Date pivot au format ISO (YYYY-MM-DD) pour le tri mêlé devis/chantiers. */
  date: string;
  montantHt: number | null;
  statut: string;
};

/**
 * Devis et chantiers du client, mêlés et triés par date décroissante.
 * Source unique du bloc « Activité commerciale » (fil rouge de la fiche) et
 * des compteurs de la synthèse commerciale.
 */
export async function listerActiviteClient(clientId: string): Promise<ActiviteClientItem[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const devisRows = await tx
      .select({
        id: devis.id,
        ref: devis.numero,
        objet: devis.objet,
        date: devis.dateDevis,
        montantHt: devis.totalHt,
        statut: devis.statut,
      })
      .from(devis)
      .where(and(eq(devis.clientId, clientId), isNull(devis.deletedAt)))
      .orderBy(desc(devis.dateDevis));

    const chantierRows = await tx
      .select({
        id: chantiers.id,
        ref: chantiers.numero,
        objet: chantiers.libelle,
        dateDebut: chantiers.dateDebutPrevue,
        createdAt: chantiers.createdAt,
        montantHt: chantiers.montantPrevisionnelHt,
        statut: chantiers.statut,
      })
      .from(chantiers)
      .where(and(eq(chantiers.clientId, clientId), isNull(chantiers.deletedAt)))
      .orderBy(desc(chantiers.createdAt));

    const items: ActiviteClientItem[] = [
      ...devisRows.map((d) => ({
        id: d.id,
        type: 'devis' as const,
        ref: d.ref,
        objet: d.objet,
        date: d.date,
        montantHt: d.montantHt === null ? null : Number(d.montantHt),
        statut: d.statut,
      })),
      ...chantierRows.map((c) => ({
        id: c.id,
        type: 'chantier' as const,
        ref: c.ref,
        objet: c.objet,
        date: c.dateDebut ?? c.createdAt.toISOString().slice(0, 10),
        montantHt: c.montantHt === null ? null : Number(c.montantHt),
        statut: c.statut,
      })),
    ];
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return items;
  });
}

/** Une facture du client, projetée pour le bloc « Facturation & encours ». */
export type FactureClientItem = {
  id: string;
  /** Numéro légal ; NULL tant que la facture est en brouillon (attribué à l'émission). */
  numero: string | null;
  objet: string | null;
  dateFacture: string;
  dateEcheance: string | null;
  totalHt: number;
  totalTtc: number;
  statut: string;
  datePaiement: string | null;
};

/**
 * Factures du client (hors brouillons supprimés), triées par date décroissante.
 * Alimente le bloc « Facturation & encours » et le calcul de l'encours / du
 * retard de la synthèse commerciale.
 */
export async function listerFacturesClient(clientId: string): Promise<FactureClientItem[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: factures.id,
        numero: factures.numero,
        objet: factures.objet,
        dateFacture: factures.dateFacture,
        dateEcheance: factures.dateEcheance,
        totalHt: factures.totalHt,
        totalTtc: factures.totalTtc,
        statut: factures.statut,
        datePaiement: factures.datePaiement,
      })
      .from(factures)
      .where(and(eq(factures.clientId, clientId), isNull(factures.deletedAt)))
      .orderBy(desc(factures.dateFacture)),
  );
  return rows.map((f) => ({
    id: f.id,
    numero: f.numero,
    objet: f.objet,
    dateFacture: f.dateFacture,
    dateEcheance: f.dateEcheance,
    totalHt: Number(f.totalHt),
    totalTtc: Number(f.totalTtc),
    statut: f.statut,
    datePaiement: f.datePaiement,
  }));
}

/** Une entrée d'historique (audit_log) de la fiche client. */
export type EvenementHistoriqueClient = {
  id: string;
  action: 'insert' | 'update' | 'delete';
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  email: string | null;
};

/**
 * Derniers événements `audit_log` de la table `clients` pour cette fiche
 * (timeline du rail). Calque de `listerHistoriqueFournisseur` : l'email de
 * l'auteur est résolu via jointure sur `utilisateurs`.
 */
export async function listerHistoriqueClient(
  id: string,
  limit = 8,
): Promise<EvenementHistoriqueClient[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: auditLog.id,
        action: auditLog.action,
        before: auditLog.before,
        after: auditLog.after,
        createdAt: auditLog.createdAt,
        email: utilisateurs.email,
      })
      .from(auditLog)
      .leftJoin(utilisateurs, eq(utilisateurs.id, auditLog.utilisateurId))
      .where(and(eq(auditLog.tableName, 'clients'), eq(auditLog.rowId, id)))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit),
  );
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    before: (r.before as Record<string, unknown> | null) ?? null,
    after: (r.after as Record<string, unknown> | null) ?? null,
    createdAt: r.createdAt.toISOString(),
    email: r.email,
  }));
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
      const raisonSocialeId =
        parsed.data.type === 'professionnel'
          ? await getOrCreateRaisonSocialeId(
              tx,
              ctx.entreprise.id,
              parsed.data.raisonSociale,
              ctx.utilisateur.id,
            )
          : null;
      const [inserted] = await tx
        .insert(clients)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          type: parsed.data.type,
          raisonSocialeId,
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

      const raisonSocialeId =
        parsed.data.type === 'professionnel'
          ? await getOrCreateRaisonSocialeId(
              tx,
              ctx.entreprise.id,
              parsed.data.raisonSociale,
              ctx.utilisateur.id,
            )
          : null;

      await tx
        .update(clients)
        .set({
          code: parsed.data.code,
          type: parsed.data.type,
          raisonSocialeId,
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
