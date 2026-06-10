'use server';

import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { generateNumero } from '@/lib/numbering/generate';
import { chantiers, type Chantier } from '@/db/schema/chantiers';
import { compteProrata } from '@/db/schema/compte-prorata';
import { clients, devis } from '@/db/schema/commercial';
import { factures, situationsTravaux } from '@/db/schema/facturation';
import { pointages } from '@/db/schema/pointages';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  chantierSchema,
  TRANSITIONS_CHANTIER,
  type ChantierInput,
  type StatutChantier,
} from '@/lib/validation/chantiers';

import { ROLES_CHANTIER_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

export type ChantierAvecRelations = Chantier & {
  clientCode: string;
  clientNom: string;
  responsableEmail: string | null;
};

function libelleClient(c: {
  type: string;
  raisonSociale: string | null;
  nom: string | null;
  prenom: string | null;
}): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '?';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || '?';
}

// ─────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────

export async function listerChantiers(): Promise<ChantierAvecRelations[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        chantier: chantiers,
        client: {
          type: clients.type,
          code: clients.code,
          raisonSociale: clients.raisonSociale,
          nom: clients.nom,
          prenom: clients.prenom,
        },
        responsable: { email: utilisateurs.email },
      })
      .from(chantiers)
      .leftJoin(clients, eq(chantiers.clientId, clients.id))
      .leftJoin(utilisateurs, eq(chantiers.responsableId, utilisateurs.id))
      .where(isNull(chantiers.deletedAt))
      .orderBy(desc(chantiers.createdAt)),
  );

  return rows.map((r) => ({
    ...r.chantier,
    clientCode: r.client?.code ?? '',
    clientNom: r.client ? libelleClient(r.client) : '',
    responsableEmail: r.responsable?.email ?? null,
  }));
}

export type ChantierPourSelecteur = { id: string; numero: string; libelle: string };

/**
 * Variante allégée pour les selects : juste id/numéro/libellé, triés par
 * numéro. Inclut tous les chantiers non supprimés (y compris terminés —
 * une grille peut rester rattachée à un chantier clôturé pour audit).
 */
export async function listerChantiersPourSelecteur(): Promise<ChantierPourSelecteur[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: chantiers.id,
        numero: chantiers.numero,
        libelle: chantiers.libelle,
      })
      .from(chantiers)
      .where(isNull(chantiers.deletedAt))
      .orderBy(asc(chantiers.numero)),
  );
  return rows;
}

export type ChantierDetail = Chantier & {
  client: { id: string; code: string; nom: string };
  responsable: { id: string; email: string } | null;
  devisLies: { id: string; numero: string; statut: string; totalTtc: string }[];
};

export async function lireChantier(id: string): Promise<ChantierDetail | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        chantier: chantiers,
        client: {
          id: clients.id,
          code: clients.code,
          type: clients.type,
          raisonSociale: clients.raisonSociale,
          nom: clients.nom,
          prenom: clients.prenom,
        },
        responsable: { id: utilisateurs.id, email: utilisateurs.email },
      })
      .from(chantiers)
      .leftJoin(clients, eq(chantiers.clientId, clients.id))
      .leftJoin(utilisateurs, eq(chantiers.responsableId, utilisateurs.id))
      .where(and(eq(chantiers.id, id), isNull(chantiers.deletedAt)))
      .limit(1),
  );
  if (!row || !row.client) return null;

  const devisLies = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: devis.id,
        numero: devis.numero,
        statut: devis.statut,
        totalTtc: devis.totalTtc,
      })
      .from(devis)
      .where(and(eq(devis.chantierId, id), isNull(devis.deletedAt)))
      .orderBy(asc(devis.dateDevis)),
  );

  return {
    ...row.chantier,
    client: {
      id: row.client.id,
      code: row.client.code,
      nom: libelleClient(row.client),
    },
    responsable: row.responsable && row.responsable.id ? { id: row.responsable.id, email: row.responsable.email } : null,
    devisLies,
  };
}

export async function listerResponsablesPossibles(): Promise<{ id: string; email: string }[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: utilisateurs.id, email: utilisateurs.email })
      .from(utilisateurs)
      .where(and(isNull(utilisateurs.deletedAt), eq(utilisateurs.actif, true)))
      .orderBy(asc(utilisateurs.email)),
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

export async function creerChantier(
  input: ChantierInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  const parsed = chantierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const { id, numero } = await withTenant(ctx.entreprise.id, async (tx) => {
      const numero = await generateNumero(tx, 'chantier', ctx.entreprise.id);
      const [inserted] = await tx
        .insert(chantiers)
        .values({
          entrepriseId: ctx.entreprise.id,
          numero,
          libelle: parsed.data.libelle,
          clientId: parsed.data.clientId,
          responsableId: parsed.data.responsableId,
          statut: parsed.data.statut,
          dateDebutPrevue: parsed.data.dateDebutPrevue,
          dateFinPrevue: parsed.data.dateFinPrevue,
          dateDebutReelle: parsed.data.dateDebutReelle,
          dateFinReelle: parsed.data.dateFinReelle,
          montantPrevisionnelHt: parsed.data.montantPrevisionnelHt,
          adresseLigne1: parsed.data.adresseLigne1,
          adresseLigne2: parsed.data.adresseLigne2,
          codePostal: parsed.data.codePostal,
          ville: parsed.data.ville,
          description: parsed.data.description,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: chantiers.id });
      if (!inserted) throw new Error('INSERT failed');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'chantiers',
        rowId: inserted.id,
        after: { numero, ...parsed.data },
      });
      return { id: inserted.id, numero };
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers`);
    return { ok: true, data: { id, numero } };
  } catch (err) {
    throw err;
  }
}

export async function mettreAJourChantier(
  id: string,
  input: ChantierInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  const parsed = chantierSchema.safeParse(input);
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
        .from(chantiers)
        .where(and(eq(chantiers.id, id), isNull(chantiers.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(chantiers)
        .set({
          libelle: parsed.data.libelle,
          clientId: parsed.data.clientId,
          responsableId: parsed.data.responsableId,
          dateDebutPrevue: parsed.data.dateDebutPrevue,
          dateFinPrevue: parsed.data.dateFinPrevue,
          dateDebutReelle: parsed.data.dateDebutReelle,
          dateFinReelle: parsed.data.dateFinReelle,
          montantPrevisionnelHt: parsed.data.montantPrevisionnelHt,
          adresseLigne1: parsed.data.adresseLigne1,
          adresseLigne2: parsed.data.adresseLigne2,
          codePostal: parsed.data.codePostal,
          ville: parsed.data.ville,
          description: parsed.data.description,
          notes: parsed.data.notes,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(chantiers.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'chantiers',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers`);
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Chantier introuvable.' };
    }
    throw err;
  }
}

export async function changerStatutChantier(
  id: string,
  nouveauStatut: StatutChantier,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(chantiers)
        .where(and(eq(chantiers.id, id), isNull(chantiers.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      const transitionsValides = TRANSITIONS_CHANTIER[before.statut as StatutChantier];
      if (!transitionsValides.includes(nouveauStatut)) {
        throw new Error(
          `Transition impossible : ${before.statut} → ${nouveauStatut}. Possible : ${transitionsValides.join(', ') || 'aucune'}.`,
        );
      }

      const updates: Partial<typeof chantiers.$inferInsert> = {
        statut: nouveauStatut,
        updatedBy: ctx.utilisateur.id,
      };
      // Auto-remplissage des dates réelles si pas déjà saisies
      const aujourdHui = new Date().toISOString().slice(0, 10);
      if (nouveauStatut === 'en_cours' && !before.dateDebutReelle) {
        updates.dateDebutReelle = aujourdHui;
      }
      if (nouveauStatut === 'termine' && !before.dateFinReelle) {
        updates.dateFinReelle = aujourdHui;
      }

      await tx.update(chantiers).set(updates).where(eq(chantiers.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'chantiers',
        rowId: id,
        before: { statut: before.statut },
        after: { statut: nouveauStatut, ...updates },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers`);
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Chantier introuvable.' };
    }
    if (err instanceof Error && err.message.startsWith('Transition impossible')) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export async function supprimerChantier(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  try {
    const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(chantiers)
        .where(and(eq(chantiers.id, id), isNull(chantiers.deletedAt)));
      if (!before) return null;
      if (before.statut !== 'prospect') {
        throw new Error('Seuls les chantiers en prospect peuvent être supprimés.');
      }

      // Soft-delete : pas de FK déclenchée → vérification explicite. Les tâches
      // (`chantier_taches`) sont en cascade et ne comptent pas.
      const compte = async (table: PgTable, col: PgColumn) => {
        const [r] = await tx.select({ n: count() }).from(table).where(eq(col, id));
        return r?.n ?? 0;
      };
      // Compte prorata : seul un compte non supprimé bloque (FK ON DELETE RESTRICT).
      const [cp] = await tx
        .select({ n: count() })
        .from(compteProrata)
        .where(and(eq(compteProrata.chantierId, id), isNull(compteProrata.deletedAt)));
      const message = messageBlocageSuppression('ce chantier', [
        {
          nombre: await compte(situationsTravaux, situationsTravaux.chantierId),
          singulier: 'situation de travaux',
          pluriel: 'situations de travaux',
        },
        {
          nombre: await compte(pointages, pointages.chantierId),
          singulier: 'pointage',
          pluriel: 'pointages',
        },
        {
          nombre: await compte(factures, factures.chantierId),
          singulier: 'facture',
          pluriel: 'factures',
        },
        {
          nombre: cp?.n ?? 0,
          singulier: 'compte prorata',
          pluriel: 'comptes prorata',
        },
      ]);
      if (message) return message;

      await tx
        .update(chantiers)
        .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
        .where(eq(chantiers.id, id));
      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'chantiers',
        rowId: id,
        before,
      });
      return null;
    });
    if (blocage) return { ok: false, error: blocage };
    revalidatePath(`/${ctx.entreprise.slug}/chantiers`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Seuls les chantiers')) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Workflow devis → chantier
// ─────────────────────────────────────────────────────────────

/**
 * Crée un chantier pré-rempli à partir d'un devis accepté
 * et lie le devis au chantier.
 *
 * Conditions atomiques (vérifiées DANS la transaction) :
 * - le devis existe, n'est pas supprimé
 * - son statut est `accepte`
 * - il n'est pas déjà lié à un chantier
 */
export async function creerChantierDepuisDevis(
  devisId: string,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);

  try {
    const { id, numero } = await withTenant(ctx.entreprise.id, async (tx) => {
      const numero = await generateNumero(tx, 'chantier', ctx.entreprise.id);
      const [d] = await tx
        .select()
        .from(devis)
        .where(and(eq(devis.id, devisId), isNull(devis.deletedAt)));
      if (!d) throw new Error('DEVIS_NOT_FOUND');
      if (d.statut !== 'gagne') throw new Error('DEVIS_NOT_GAGNE');
      if (d.chantierId) throw new Error('DEVIS_DEJA_LIE');

      const libelle = d.objet?.trim() ? d.objet : `Chantier ${d.numero}`;

      const [inserted] = await tx
        .insert(chantiers)
        .values({
          entrepriseId: ctx.entreprise.id,
          numero,
          libelle,
          clientId: d.clientId,
          responsableId: ctx.utilisateur.id,
          statut: 'prospect',
          montantPrevisionnelHt: d.totalHt,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: chantiers.id });
      if (!inserted) throw new Error('INSERT failed');

      await tx
        .update(devis)
        .set({ chantierId: inserted.id, updatedBy: ctx.utilisateur.id })
        .where(eq(devis.id, devisId));

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'chantiers',
        rowId: inserted.id,
        after: {
          numero,
          libelle,
          clientId: d.clientId,
          provenance: 'devis',
          devisId,
        },
      });

      return { id: inserted.id, numero };
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers`);
    revalidatePath(`/${ctx.entreprise.slug}/commercial/devis`);
    revalidatePath(`/${ctx.entreprise.slug}/commercial/devis/${devisId}`);
    return { ok: true, data: { id, numero } };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'DEVIS_NOT_FOUND') {
        return { ok: false, error: 'Devis introuvable.' };
      }
      if (err.message === 'DEVIS_NOT_GAGNE') {
        return {
          ok: false,
          error: 'Le devis doit être au statut « gagné » pour créer le chantier.',
        };
      }
      if (err.message === 'DEVIS_DEJA_LIE') {
        return { ok: false, error: 'Ce devis est déjà lié à un chantier.' };
      }
    }
    throw err;
  }
}
