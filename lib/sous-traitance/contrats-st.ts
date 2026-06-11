'use server';

import { and, desc, eq, getTableColumns, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { chantiers } from '@/db/schema/chantiers';
import { contratsSt, facturesSt, type ContratSt } from '@/db/schema/sous-traitance';
import { sousTraitants } from '@/db/schema/tiers';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { calculerMontantRetenue } from '@/lib/facturation/calculs';
import { generateNumero } from '@/lib/numbering/generate';
import {
  contratStSchema,
  TRANSITIONS_CONTRAT_ST,
  type ContratStInput,
  type StatutContratSt,
} from '@/lib/validation/contrat-st';

import { verifierConformiteSousTraitant } from './conformite-st';
import { ROLES_CONTRAT_ST_WRITE } from './permissions';

export type ContratStAvecContexte = ContratSt & {
  sousTraitantNom: string;
  sousTraitantCode: string;
  chantierNumero: string;
  chantierLibelle: string;
  nbFactures: number;
};

const SELECT_CONTEXTE = {
  sousTraitantNom: sousTraitants.nom,
  sousTraitantCode: sousTraitants.code,
  chantierNumero: chantiers.numero,
  chantierLibelle: chantiers.libelle,
  nbFactures: sql<number>`
    (SELECT COUNT(*)::int FROM factures_st f
     WHERE f.contrat_st_id = contrats_st.id AND f.deleted_at IS NULL)
  `,
} as const;

export async function listerContratsSt(filtre?: {
  sousTraitantId?: string;
  chantierId?: string;
}): Promise<ContratStAvecContexte[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) => {
    const conds = [isNull(contratsSt.deletedAt)];
    if (filtre?.sousTraitantId) conds.push(eq(contratsSt.sousTraitantId, filtre.sousTraitantId));
    if (filtre?.chantierId) conds.push(eq(contratsSt.chantierId, filtre.chantierId));
    return tx
      .select({ ...getTableColumns(contratsSt), ...SELECT_CONTEXTE })
      .from(contratsSt)
      .innerJoin(sousTraitants, eq(sousTraitants.id, contratsSt.sousTraitantId))
      .innerJoin(chantiers, eq(chantiers.id, contratsSt.chantierId))
      .where(and(...conds))
      .orderBy(desc(contratsSt.createdAt));
  });
}

export async function lireContratSt(id: string): Promise<ContratStAvecContexte | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ ...getTableColumns(contratsSt), ...SELECT_CONTEXTE })
      .from(contratsSt)
      .innerJoin(sousTraitants, eq(sousTraitants.id, contratsSt.sousTraitantId))
      .innerJoin(chantiers, eq(chantiers.id, contratsSt.chantierId))
      .where(and(eq(contratsSt.id, id), isNull(contratsSt.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}

export async function creerContratSt(input: ContratStInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CONTRAT_ST_WRITE);
  const parsed = contratStSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  const montantRetenue = calculerMontantRetenue(d.montantHt, d.tauxRetenueGarantie);

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const numero = await generateNumero(tx, 'contrat_st', ctx.entreprise.id);
      const [inserted] = await tx
        .insert(contratsSt)
        .values({
          entrepriseId: ctx.entreprise.id,
          sousTraitantId: d.sousTraitantId,
          chantierId: d.chantierId,
          numero,
          objet: d.objet,
          montantHt: d.montantHt,
          tauxRetenueGarantie: d.tauxRetenueGarantie,
          montantRetenue,
          dateSignature: d.dateSignature,
          dateDebutPrevue: d.dateDebutPrevue,
          dateFinPrevue: d.dateFinPrevue,
          statut: d.statut,
          notes: d.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: contratsSt.id });
      if (!inserted) throw new Error('INSERT failed');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'contrats_st',
        rowId: inserted.id,
        after: { ...d, numero, montantRetenue },
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants/${d.sousTraitantId}/contrats`);
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${d.chantierId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    return mapErreurFk(err);
  }
}

export async function mettreAJourContratSt(
  id: string,
  input: ContratStInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CONTRAT_ST_WRITE);
  const parsed = contratStSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  const montantRetenue = calculerMontantRetenue(d.montantHt, d.tauxRetenueGarantie);

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(contratsSt)
        .where(and(eq(contratsSt.id, id), isNull(contratsSt.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      await tx
        .update(contratsSt)
        .set({
          sousTraitantId: d.sousTraitantId,
          chantierId: d.chantierId,
          objet: d.objet,
          montantHt: d.montantHt,
          tauxRetenueGarantie: d.tauxRetenueGarantie,
          montantRetenue,
          dateSignature: d.dateSignature,
          dateDebutPrevue: d.dateDebutPrevue,
          dateFinPrevue: d.dateFinPrevue,
          notes: d.notes,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(contratsSt.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'contrats_st',
        rowId: id,
        before,
        after: { ...d, montantRetenue },
      });
    });
    revalidatePath(
      `/${ctx.entreprise.slug}/tiers/sous-traitants/${d.sousTraitantId}/contrats/${id}`,
    );
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Contrat introuvable.' };
    }
    return mapErreurFk(err);
  }
}

/**
 * Change le statut d'un contrat ST en respectant les transitions autorisées.
 * L'activation (→ actif) est BLOQUÉE si le sous-traitant n'est pas en règle
 * (conformité documentaire — réutilise le moteur Référencement, cf.
 * lib/sous-traitance/conformite-st.ts).
 */
export async function changerStatutContratSt(
  id: string,
  statut: StatutContratSt,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CONTRAT_ST_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(contratsSt)
        .where(and(eq(contratsSt.id, id), isNull(contratsSt.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      if (before.statut === statut) return;
      const autorisees = TRANSITIONS_CONTRAT_ST[before.statut as StatutContratSt] ?? [];
      if (!autorisees.includes(statut)) throw new Error('TRANSITION_INTERDITE');

      if (statut === 'actif') {
        const [st] = await tx
          .select({
            tierId: sousTraitants.tierId,
            assuranceDecennaleDateFin: sousTraitants.assuranceDecennaleDateFin,
            dateAttestationUrssaf: sousTraitants.dateAttestationUrssaf,
          })
          .from(sousTraitants)
          .where(eq(sousTraitants.id, before.sousTraitantId));
        if (st) {
          const verdict = await verifierConformiteSousTraitant(st, {
            referencementActif: ctx.entreprise.tiersReferencementActive,
          });
          if (!verdict.ok) throw new Error(`CONFORMITE:${verdict.raison ?? 'non conforme'}`);
        }
      }

      await tx
        .update(contratsSt)
        .set({ statut, updatedBy: ctx.utilisateur.id })
        .where(eq(contratsSt.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'contrats_st',
        rowId: id,
        before,
        after: { ...before, statut },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Contrat introuvable.' };
    }
    if (err instanceof Error && err.message === 'TRANSITION_INTERDITE') {
      return { ok: false, error: 'Transition de statut non autorisée.' };
    }
    if (err instanceof Error && err.message.startsWith('CONFORMITE:')) {
      return {
        ok: false,
        error: `Activation refusée — ${err.message.slice('CONFORMITE:'.length)}`,
      };
    }
    throw err;
  }
}

export async function supprimerContratSt(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CONTRAT_ST_WRITE);
  let blocage: string | null = null;
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(contratsSt)
      .where(and(eq(contratsSt.id, id), isNull(contratsSt.deletedAt)));
    if (!before) return;

    // Garde-fou référentiel : refus si des factures ST référencent ce contrat.
    const rowsFactures = await tx
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(facturesSt)
      .where(and(eq(facturesSt.contratStId, id), isNull(facturesSt.deletedAt)));
    blocage = messageBlocageSuppression('ce contrat de sous-traitance', [
      { nombre: rowsFactures[0]?.n ?? 0, singulier: 'facture ST', pluriel: 'factures ST' },
    ]);
    if (blocage) return;

    await tx
      .update(contratsSt)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(contratsSt.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'contrats_st', rowId: id, before });
  });
  if (blocage) return { ok: false, error: blocage };
  revalidatePath(`/${ctx.entreprise.slug}/tiers/sous-traitants`);
  return { ok: true, data: undefined };
}

function mapErreurFk(err: unknown): ActionResult<never> {
  if (err instanceof Error && /unique/i.test(err.message)) {
    return { ok: false, error: 'Numéro de contrat déjà attribué.' };
  }
  throw err;
}
