'use server';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { contratsSt, facturesSt, lignesFactureSt, type FactureSt, type LigneFactureSt } from '@/db/schema/sous-traitance';
import { sousTraitants } from '@/db/schema/tiers';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { appliquerRemiseGlobale } from '@/lib/remise-globale';
import { generateNumero } from '@/lib/numbering/generate';
import { calculerMontantLigneFacture, calculerMontantRetenue, calculerTotauxFacture } from '@/lib/facturation/calculs';
import {
  factureStSchema,
  paiementStSchema,
  TRANSITIONS_FACTURE_ST,
  type FactureStInput,
  type PaiementStInput,
  type StatutFactureSt,
} from '@/lib/validation/facture-st';

import { ROLES_FACTURE_ST_WRITE } from './permissions';

export type FactureStAvecContexte = FactureSt & {
  contratNumero: string;
  sousTraitantNom: string;
  sousTraitantCode: string;
};

export type FactureStHydratee = FactureStAvecContexte & {
  lignes: LigneFactureSt[];
};

const SELECT_CONTEXTE = {
  contratNumero: contratsSt.numero,
  sousTraitantNom: sousTraitants.nom,
  sousTraitantCode: sousTraitants.code,
} as const;

/** Calcule les totaux figés d'une facture ST depuis ses lignes + options. */
function totauxFactureSt(d: FactureStInput) {
  const totaux = appliquerRemiseGlobale(
    calculerTotauxFacture(d.lignes, { autoLiquidation: d.autoLiquidation }),
    { type: d.remiseGlobaleType, valeur: d.remiseGlobaleValeur },
  );
  const montantRetenue = calculerMontantRetenue(totaux.totalHt, d.retenueGarantiePct) ?? '0.00';
  const montantNet = (Number(totaux.totalTtc) - Number(montantRetenue)).toFixed(2);
  return { totaux, montantRetenue, montantNet };
}

export async function listerFacturesSt(filtre?: {
  contratStId?: string;
}): Promise<FactureStAvecContexte[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) => {
    const conds = [isNull(facturesSt.deletedAt)];
    if (filtre?.contratStId) conds.push(eq(facturesSt.contratStId, filtre.contratStId));
    return tx
      .select({
        facture: facturesSt,
        contratNumero: contratsSt.numero,
        sousTraitantNom: sousTraitants.nom,
        sousTraitantCode: sousTraitants.code,
      })
      .from(facturesSt)
      .innerJoin(contratsSt, eq(contratsSt.id, facturesSt.contratStId))
      .innerJoin(sousTraitants, eq(sousTraitants.id, contratsSt.sousTraitantId))
      .where(and(...conds))
      .orderBy(desc(facturesSt.dateFacture), desc(facturesSt.numero))
      .then((rows) =>
        rows.map((r) => ({
          ...r.facture,
          contratNumero: r.contratNumero,
          sousTraitantNom: r.sousTraitantNom,
          sousTraitantCode: r.sousTraitantCode,
        })),
      );
  });
}

export async function lireFactureSt(id: string): Promise<FactureStHydratee | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select({ facture: facturesSt, ...SELECT_CONTEXTE })
      .from(facturesSt)
      .innerJoin(contratsSt, eq(contratsSt.id, facturesSt.contratStId))
      .innerJoin(sousTraitants, eq(sousTraitants.id, contratsSt.sousTraitantId))
      .where(and(eq(facturesSt.id, id), isNull(facturesSt.deletedAt)))
      .limit(1);
    if (!row) return null;
    const lignes = await tx
      .select()
      .from(lignesFactureSt)
      .where(eq(lignesFactureSt.factureStId, id))
      .orderBy(asc(lignesFactureSt.ordre), asc(lignesFactureSt.id));
    return {
      ...row.facture,
      contratNumero: row.contratNumero,
      sousTraitantNom: row.sousTraitantNom,
      sousTraitantCode: row.sousTraitantCode,
      lignes,
    };
  });
}

function valuesLignes(d: FactureStInput, entrepriseId: string, factureStId: string) {
  return d.lignes.map((l, idx) => {
    const m = calculerMontantLigneFacture(l);
    return {
      entrepriseId,
      factureStId,
      ordre: idx,
      type: l.type,
      designation: l.designation,
      articleId: l.type === 'article_catalogue' ? l.articleId : null,
      quantite: l.type === 'section' ? null : (l.quantite as string),
      unite: l.type === 'section' ? null : l.unite,
      prixUnitaireHt: l.type === 'section' ? null : (l.prixUnitaireHt as string),
      tauxTva: l.type === 'section' ? null : (l.tauxTva as string),
      remisePourcent: l.type === 'section' ? null : l.remisePourcent,
      montantHt: m.montantHt,
      montantTva: m.montantTva,
      montantTtc: m.montantTtc,
      notes: l.notes,
    };
  });
}

export async function creerFactureSt(
  input: FactureStInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURE_ST_WRITE);
  const parsed = factureStSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const d = parsed.data;
  const { totaux, montantRetenue, montantNet } = totauxFactureSt(d);

  try {
    const { id, numero } = await withTenant(ctx.entreprise.id, async (tx) => {
      const numero = await generateNumero(tx, 'facture_st', ctx.entreprise.id);
      const [inserted] = await tx
        .insert(facturesSt)
        .values({
          entrepriseId: ctx.entreprise.id,
          contratStId: d.contratStId,
          numero,
          dateFacture: d.dateFacture,
          dateEcheance: d.dateEcheance,
          delaiPaiementJours: d.delaiPaiementJours,
          objet: d.objet,
          notes: d.notes,
          autoLiquidation: d.autoLiquidation,
          paiementDirect: d.paiementDirect,
          retenueGarantiePct: d.retenueGarantiePct,
          montantRetenue,
          montantNet,
          totalHt: totaux.totalHt,
          totalTva: totaux.totalTva,
          totalTtc: totaux.totalTtc,
          detailsTva: totaux.detailsTva,
          remiseGlobaleType: d.remiseGlobaleType,
          remiseGlobaleValeur: d.remiseGlobaleValeur,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: facturesSt.id });
      if (!inserted) throw new Error('INSERT failed');
      await tx.insert(lignesFactureSt).values(valuesLignes(d, ctx.entreprise.id, inserted.id));
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'factures_st',
        rowId: inserted.id,
        after: { numero, ...d, montantRetenue, montantNet },
      });
      return { id: inserted.id, numero };
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures-st`);
    return { ok: true, data: { id, numero } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: 'Conflit de numéro de facture ST, réessayez.' };
    }
    throw err;
  }
}

export async function mettreAJourFactureSt(id: string, input: FactureStInput): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURE_ST_WRITE);
  const parsed = factureStSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const d = parsed.data;
  const { totaux, montantRetenue, montantNet } = totauxFactureSt(d);

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(facturesSt)
        .where(and(eq(facturesSt.id, id), isNull(facturesSt.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      if (before.statut !== 'brouillon') throw new Error('NON_MODIFIABLE');

      await tx
        .update(facturesSt)
        .set({
          contratStId: d.contratStId,
          dateFacture: d.dateFacture,
          dateEcheance: d.dateEcheance,
          delaiPaiementJours: d.delaiPaiementJours,
          objet: d.objet,
          notes: d.notes,
          autoLiquidation: d.autoLiquidation,
          paiementDirect: d.paiementDirect,
          retenueGarantiePct: d.retenueGarantiePct,
          montantRetenue,
          montantNet,
          totalHt: totaux.totalHt,
          totalTva: totaux.totalTva,
          totalTtc: totaux.totalTtc,
          detailsTva: totaux.detailsTva,
          remiseGlobaleType: d.remiseGlobaleType,
          remiseGlobaleValeur: d.remiseGlobaleValeur,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(facturesSt.id, id));
      await tx.delete(lignesFactureSt).where(eq(lignesFactureSt.factureStId, id));
      await tx.insert(lignesFactureSt).values(valuesLignes(d, ctx.entreprise.id, id));
      await auditLogIn(tx, { action: 'update', tableName: 'factures_st', rowId: id, before, after: d });
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures-st`);
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures-st/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') return { ok: false, error: 'Facture ST introuvable.' };
    if (err instanceof Error && err.message === 'NON_MODIFIABLE') {
      return { ok: false, error: 'Seules les factures ST en brouillon sont éditables.' };
    }
    throw err;
  }
}

export async function changerStatutFactureSt(
  id: string,
  nouveau: StatutFactureSt,
  options: { datePaiement?: string } = {},
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURE_ST_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(facturesSt)
        .where(and(eq(facturesSt.id, id), isNull(facturesSt.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      const actuel = before.statut as StatutFactureSt;
      if (!TRANSITIONS_FACTURE_ST[actuel].includes(nouveau)) throw new Error('TRANSITION_INVALIDE');

      const updates: Partial<typeof facturesSt.$inferInsert> = {
        statut: nouveau,
        updatedBy: ctx.utilisateur.id,
      };
      if (nouveau === 'emise' && !before.dateEmission) updates.dateEmission = new Date();
      if (nouveau === 'payee') {
        updates.datePaiement = options.datePaiement ?? new Date().toISOString().slice(0, 10);
        updates.cumulPayeTtc = before.montantNet;
      }
      await tx.update(facturesSt).set(updates).where(eq(facturesSt.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'factures_st',
        rowId: id,
        before: { statut: actuel },
        after: { statut: nouveau },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures-st`);
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures-st/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') return { ok: false, error: 'Facture ST introuvable.' };
    if (err instanceof Error && err.message === 'TRANSITION_INVALIDE') {
      return { ok: false, error: 'Transition de statut non autorisée.' };
    }
    throw err;
  }
}

/**
 * Enregistre un règlement (partiel ou total) d'une facture ST. Incrémente le
 * cumul payé ; bascule en « payée » dès que le cumul atteint le montant net.
 */
export async function enregistrerPaiementSt(
  id: string,
  input: PaiementStInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURE_ST_WRITE);
  const parsed = paiementStSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(facturesSt)
        .where(and(eq(facturesSt.id, id), isNull(facturesSt.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      if (before.statut === 'brouillon' || before.statut === 'annulee') throw new Error('NON_PAYABLE');

      const cumul = Number(before.cumulPayeTtc) + Number(d.montant);
      const net = Number(before.montantNet);
      const solde = cumul >= net - 0.005; // tolérance centime
      const datePaiement = d.datePaiement ?? new Date().toISOString().slice(0, 10);

      await tx
        .update(facturesSt)
        .set({
          cumulPayeTtc: cumul.toFixed(2),
          statut: solde ? 'payee' : before.statut,
          datePaiement: solde ? datePaiement : before.datePaiement,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(facturesSt.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'factures_st',
        rowId: id,
        before: { cumulPayeTtc: before.cumulPayeTtc, statut: before.statut },
        after: { cumulPayeTtc: cumul.toFixed(2), statut: solde ? 'payee' : before.statut, paiement: d },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures-st`);
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures-st/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') return { ok: false, error: 'Facture ST introuvable.' };
    if (err instanceof Error && err.message === 'NON_PAYABLE') {
      return { ok: false, error: 'Seules les factures ST émises ou en retard acceptent un paiement.' };
    }
    throw err;
  }
}

export async function supprimerFactureSt(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURE_ST_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(facturesSt)
        .where(and(eq(facturesSt.id, id), isNull(facturesSt.deletedAt)));
      if (!before) return;
      if (before.statut !== 'brouillon') throw new Error('NON_SUPPRIMABLE');
      await tx
        .update(facturesSt)
        .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
        .where(eq(facturesSt.id, id));
      await auditLogIn(tx, { action: 'delete', tableName: 'factures_st', rowId: id, before });
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures-st`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NON_SUPPRIMABLE') {
      return { ok: false, error: 'Seules les factures ST en brouillon peuvent être supprimées.' };
    }
    throw err;
  }
}
