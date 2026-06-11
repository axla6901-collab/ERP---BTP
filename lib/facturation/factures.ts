'use server';

import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { generateNumero } from '@/lib/numbering/generate';
import {
  factures,
  lignesFacture,
  situationsTravaux,
  type Facture,
  type LigneFacture,
} from '@/db/schema/facturation';
import { clients } from '@/db/schema/commercial';
import {
  factureSchema,
  TRANSITIONS_FACTURE,
  type FactureInput,
  type StatutFacture,
} from '@/lib/validation/facturation';

import {
  calculerMontantLigneFacture,
  calculerMontantRetenue,
  calculerTotauxFacture,
} from './calculs';
import { appliquerRemiseGlobale } from '@/lib/remise-globale';
import { ROLES_FACTURATION_WRITE } from './permissions';
import type { ActionResult } from './types';

export type FactureAvecClient = Facture & {
  clientCode: string;
  clientNom: string;
};

export type FactureHydrate = Facture & {
  client: { id: string; code: string; nom: string };
  lignes: LigneFacture[];
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

export async function listerFactures(): Promise<FactureAvecClient[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        facture: factures,
        client: {
          type: clients.type,
          code: clients.code,
          raisonSociale: clients.raisonSociale,
          nom: clients.nom,
          prenom: clients.prenom,
        },
      })
      .from(factures)
      .leftJoin(clients, eq(factures.clientId, clients.id))
      .where(isNull(factures.deletedAt))
      .orderBy(desc(factures.dateFacture), desc(factures.numero)),
  );

  return rows.map((r) => ({
    ...r.facture,
    clientCode: r.client?.code ?? '',
    clientNom: r.client ? libelleClient(r.client) : '',
  }));
}

export async function lireFacture(id: string): Promise<FactureHydrate | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select({
        facture: factures,
        client: {
          id: clients.id,
          code: clients.code,
          type: clients.type,
          raisonSociale: clients.raisonSociale,
          nom: clients.nom,
          prenom: clients.prenom,
        },
      })
      .from(factures)
      .leftJoin(clients, eq(factures.clientId, clients.id))
      .where(and(eq(factures.id, id), isNull(factures.deletedAt)))
      .limit(1);
    if (!row || !row.client) return null;

    const lignes = await tx
      .select()
      .from(lignesFacture)
      .where(eq(lignesFacture.factureId, id))
      .orderBy(asc(lignesFacture.ordre), asc(lignesFacture.id));

    return {
      ...row.facture,
      client: {
        id: row.client.id,
        code: row.client.code,
        nom: libelleClient(row.client),
      },
      lignes,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Écriture
// ─────────────────────────────────────────────────────────────

export async function creerFacture(
  input: FactureInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  const parsed = factureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const totaux = appliquerRemiseGlobale(
    calculerTotauxFacture(parsed.data.lignes, {
      autoLiquidation: parsed.data.autoLiquidation,
    }),
    {
      type: parsed.data.remiseGlobaleType,
      valeur: parsed.data.remiseGlobaleValeur,
    },
  );
  const montantRetenue = calculerMontantRetenue(totaux.totalHt, parsed.data.retenueGarantiePct);

  try {
    const { id, numero } = await withTenant(ctx.entreprise.id, async (tx) => {
      const numero = await generateNumero(tx, 'facture', ctx.entreprise.id);

      const [inserted] = await tx
        .insert(factures)
        .values({
          entrepriseId: ctx.entreprise.id,
          numero,
          clientId: parsed.data.clientId,
          chantierId: parsed.data.chantierId,
          devisId: parsed.data.devisId,
          dateFacture: parsed.data.dateFacture,
          dateEcheance: parsed.data.dateEcheance,
          delaiPaiementJours: parsed.data.delaiPaiementJours,
          objet: parsed.data.objet,
          conditionsPaiement: parsed.data.conditionsPaiement,
          mentionsLegales: parsed.data.mentionsLegales,
          notes: parsed.data.notes,
          autoLiquidation: parsed.data.autoLiquidation,
          retenueGarantiePct: parsed.data.retenueGarantiePct,
          montantRetenue,
          totalHt: totaux.totalHt,
          totalTva: totaux.totalTva,
          totalTtc: totaux.totalTtc,
          detailsTva: totaux.detailsTva,
          remiseGlobaleType: parsed.data.remiseGlobaleType,
          remiseGlobaleValeur: parsed.data.remiseGlobaleValeur,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: factures.id });
      if (!inserted) throw new Error('INSERT failed');

      await tx.insert(lignesFacture).values(
        parsed.data.lignes.map((l, idx) => {
          const m = calculerMontantLigneFacture(l);
          return {
            entrepriseId: ctx.entreprise.id,
            factureId: inserted.id,
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
        }),
      );

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'factures',
        rowId: inserted.id,
        after: { numero, ...parsed.data },
      });

      return { id: inserted.id, numero };
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures`);
    return { ok: true, data: { id, numero } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: 'Conflit de numéro de facture, réessayez.' };
    }
    throw err;
  }
}

export async function mettreAJourFacture(id: string, input: FactureInput): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  const parsed = factureSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const totaux = appliquerRemiseGlobale(
    calculerTotauxFacture(parsed.data.lignes, {
      autoLiquidation: parsed.data.autoLiquidation,
    }),
    {
      type: parsed.data.remiseGlobaleType,
      valeur: parsed.data.remiseGlobaleValeur,
    },
  );
  const montantRetenue = calculerMontantRetenue(totaux.totalHt, parsed.data.retenueGarantiePct);

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(factures)
        .where(and(eq(factures.id, id), isNull(factures.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      if (before.statut !== 'brouillon') {
        throw new Error('NON_MODIFIABLE');
      }

      await tx
        .update(factures)
        .set({
          clientId: parsed.data.clientId,
          chantierId: parsed.data.chantierId,
          devisId: parsed.data.devisId,
          dateFacture: parsed.data.dateFacture,
          dateEcheance: parsed.data.dateEcheance,
          delaiPaiementJours: parsed.data.delaiPaiementJours,
          objet: parsed.data.objet,
          conditionsPaiement: parsed.data.conditionsPaiement,
          mentionsLegales: parsed.data.mentionsLegales,
          notes: parsed.data.notes,
          autoLiquidation: parsed.data.autoLiquidation,
          retenueGarantiePct: parsed.data.retenueGarantiePct,
          montantRetenue,
          totalHt: totaux.totalHt,
          totalTva: totaux.totalTva,
          totalTtc: totaux.totalTtc,
          detailsTva: totaux.detailsTva,
          remiseGlobaleType: parsed.data.remiseGlobaleType,
          remiseGlobaleValeur: parsed.data.remiseGlobaleValeur,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(factures.id, id));

      // Remplacement complet des lignes (idem devis : approche simple,
      // évite la complexité d'un diff côté UI).
      await tx.delete(lignesFacture).where(eq(lignesFacture.factureId, id));
      await tx.insert(lignesFacture).values(
        parsed.data.lignes.map((l, idx) => {
          const m = calculerMontantLigneFacture(l);
          return {
            entrepriseId: ctx.entreprise.id,
            factureId: id,
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
        }),
      );

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'factures',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures`);
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Facture introuvable.' };
    }
    if (err instanceof Error && err.message === 'NON_MODIFIABLE') {
      return {
        ok: false,
        error: 'Modification impossible : seules les factures en brouillon sont éditables.',
      };
    }
    throw err;
  }
}

export async function changerStatutFacture(
  id: string,
  nouveau: StatutFacture,
  options: { datePaiement?: string } = {},
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(factures)
        .where(and(eq(factures.id, id), isNull(factures.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      const actuel = before.statut as StatutFacture;
      if (!TRANSITIONS_FACTURE[actuel].includes(nouveau)) {
        throw new Error('TRANSITION_INVALIDE');
      }

      const updates: Partial<typeof factures.$inferInsert> = {
        statut: nouveau,
        updatedBy: ctx.utilisateur.id,
      };
      if (nouveau === 'emise' && !before.dateEmission) {
        updates.dateEmission = new Date();
      }
      if (nouveau === 'payee') {
        updates.datePaiement = options.datePaiement ?? new Date().toISOString().slice(0, 10);
      }

      await tx.update(factures).set(updates).where(eq(factures.id, id));

      // Si on émet une facture issue d'une situation, marque la situation comme facturée
      if (nouveau === 'emise') {
        await tx
          .update(situationsTravaux)
          .set({ statut: 'facturee', updatedBy: ctx.utilisateur.id })
          .where(eq(situationsTravaux.factureId, id));
      }

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'factures',
        rowId: id,
        before: { statut: actuel },
        after: { statut: nouveau },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures`);
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Facture introuvable.' };
    }
    if (err instanceof Error && err.message === 'TRANSITION_INVALIDE') {
      return { ok: false, error: 'Transition de statut non autorisée.' };
    }
    throw err;
  }
}

export async function supprimerFacture(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  try {
    const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(factures)
        .where(and(eq(factures.id, id), isNull(factures.deletedAt)));
      if (!before) return null;
      if (before.statut !== 'brouillon') {
        throw new Error('NON_SUPPRIMABLE');
      }

      // Soft-delete : pas de FK déclenchée. Les lignes sont en cascade. On
      // bloque si une situation de travaux référence encore cette facture.
      const [r] = await tx
        .select({ n: count() })
        .from(situationsTravaux)
        .where(eq(situationsTravaux.factureId, id));
      const message = messageBlocageSuppression('cette facture', [
        {
          nombre: r?.n ?? 0,
          singulier: 'situation de travaux',
          pluriel: 'situations de travaux',
        },
      ]);
      if (message) return message;

      await tx
        .update(factures)
        .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
        .where(eq(factures.id, id));
      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'factures',
        rowId: id,
        before,
      });
      return null;
    });
    if (blocage) return { ok: false, error: blocage };
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NON_SUPPRIMABLE') {
      return {
        ok: false,
        error:
          'Suppression impossible : seules les factures en brouillon peuvent être supprimées (cohérence fiscale).',
      };
    }
    throw err;
  }
}
