'use server';

import { and, asc, desc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { chantiers } from '@/db/schema/chantiers';
import { employes } from '@/db/schema/employes';
import { pointages, type Pointage } from '@/db/schema/pointages';
import {
  matricePointageSchema,
  pointageSchema,
  type MatricePointageInput,
  type PointageInput,
  type TypePointage,
} from '@/lib/validation/rh';

import { ROLES_POINTAGE_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

export type PointageEnrichi = Pointage & {
  employeNom: string;
  employePrenom: string;
  chantierNumero: string | null;
  chantierLibelle: string | null;
};

// ─────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────

export type FiltresPointages = {
  dateMin?: string; // YYYY-MM-DD
  dateMax?: string;
  employeId?: string;
  chantierId?: string;
  type?: TypePointage;
};

export async function listerPointages(
  filtres: FiltresPointages = {},
): Promise<PointageEnrichi[]> {
  const ctx = await requireTenantContextWithMfa();

  const conditions: SQL[] = [isNull(pointages.deletedAt)];
  if (filtres.dateMin) conditions.push(gte(pointages.datePointage, filtres.dateMin));
  if (filtres.dateMax) conditions.push(lte(pointages.datePointage, filtres.dateMax));
  if (filtres.employeId) conditions.push(eq(pointages.employeId, filtres.employeId));
  if (filtres.chantierId) conditions.push(eq(pointages.chantierId, filtres.chantierId));
  if (filtres.type) conditions.push(eq(pointages.type, filtres.type));

  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        pointage: pointages,
        employe: {
          nom: employes.nom,
          prenom: employes.prenom,
        },
        chantier: {
          numero: chantiers.numero,
          libelle: chantiers.libelle,
        },
      })
      .from(pointages)
      .innerJoin(employes, eq(pointages.employeId, employes.id))
      .leftJoin(chantiers, eq(pointages.chantierId, chantiers.id))
      .where(and(...conditions))
      .orderBy(desc(pointages.datePointage), asc(employes.nom)),
  );

  return rows.map((r) => ({
    ...r.pointage,
    employeNom: r.employe.nom,
    employePrenom: r.employe.prenom,
    chantierNumero: r.chantier?.numero ?? null,
    chantierLibelle: r.chantier?.libelle ?? null,
  }));
}

export async function listerPointagesMois(
  annee: number,
  mois: number,
): Promise<PointageEnrichi[]> {
  const dateMin = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateMax = `${annee}-${String(mois).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return listerPointages({ dateMin, dateMax });
}

// ─────────────────────────────────────────────────────────────
// Mutations unitaires
// ─────────────────────────────────────────────────────────────

export async function creerPointage(
  input: PointageInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_POINTAGE_WRITE);
  const parsed = pointageSchema.safeParse(input);
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
        .insert(pointages)
        .values({
          entrepriseId: ctx.entreprise.id,
          employeId: parsed.data.employeId,
          chantierId: parsed.data.chantierId,
          chantierTacheId: parsed.data.chantierTacheId,
          datePointage: parsed.data.datePointage,
          type: parsed.data.type,
          quantite: parsed.data.quantite,
          motifAbsence: parsed.data.motifAbsence,
          zoneDeplacement: parsed.data.zoneDeplacement,
          panier: parsed.data.panier,
          grandPanier: parsed.data.grandPanier,
          nuitPanierSoir: parsed.data.nuitPanierSoir,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: pointages.id });
      if (!inserted) throw new Error('INSERT failed');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'pointages',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/pointages`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /uq_pointages/.test(err.message)) {
      return {
        ok: false,
        error: 'Doublon : un pointage existe déjà pour ce couple (employé, date, chantier, type).',
      };
    }
    throw err;
  }
}

export async function supprimerPointage(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_POINTAGE_WRITE);
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(pointages)
      .where(and(eq(pointages.id, id), isNull(pointages.deletedAt)));
    if (!before) return;
    await tx
      .update(pointages)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(pointages.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'pointages',
      rowId: id,
      before,
    });
  });
  revalidatePath(`/${ctx.entreprise.slug}/rh/pointages`);
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Saisie matrice mensuelle (mass update)
// ─────────────────────────────────────────────────────────────

/**
 * Remplace **atomiquement** les pointages d'un mois pour les couples
 * (employé, chantier, type) listés dans `lignes`. Les jours sans valeur
 * (null/0) ne créent pas de pointage. Les anciens pointages des mêmes
 * couples sur le mois sont **soft-deleted** avant ré-insertion.
 *
 * Cette approche est idempotente : refaire la sauvegarde produit le même état.
 */
export async function saisirMatricePointages(
  input: MatricePointageInput,
): Promise<ActionResult<{ inserted: number; deleted: number }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_POINTAGE_WRITE);
  const parsed = matricePointageSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données matrice invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { annee, mois, lignes } = parsed.data;
  const dateMin = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateMax = `${annee}-${String(mois).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Construire les pointages à insérer
  type RowToInsert = typeof pointages.$inferInsert;
  const toInsert: RowToInsert[] = [];
  for (const ligne of lignes) {
    for (const [jourStr, quantite] of Object.entries(ligne.jours)) {
      if (quantite === null || quantite === undefined || quantite === '') continue;
      const n = typeof quantite === 'number' ? quantite : Number(String(quantite).replace(',', '.'));
      if (Number.isNaN(n) || n <= 0) continue;
      const day = parseInt(jourStr, 10);
      if (day < 1 || day > lastDay) continue;
      const dateStr = `${annee}-${String(mois).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      toInsert.push({
        entrepriseId: ctx.entreprise.id,
        employeId: ligne.employeId,
        chantierId: ligne.chantierId,
        chantierTacheId: null,
        datePointage: dateStr,
        type: ligne.type,
        quantite: n.toFixed(2),
        motifAbsence: ligne.motifAbsence,
        zoneDeplacement: ligne.zoneDeplacement,
        panier: ligne.panier,
        grandPanier: ligne.grandPanier,
        nuitPanierSoir: ligne.nuitPanierSoir,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      });
    }
  }

  try {
    const result = await withTenant(ctx.entreprise.id, async (tx) => {
      let deletedCount = 0;
      // Pour chaque ligne (couple employé, chantier, type), purge les pointages du mois
      for (const ligne of lignes) {
        const conditions: SQL[] = [
          isNull(pointages.deletedAt),
          eq(pointages.employeId, ligne.employeId),
          eq(pointages.type, ligne.type),
          gte(pointages.datePointage, dateMin),
          lte(pointages.datePointage, dateMax),
        ];
        if (ligne.chantierId) {
          conditions.push(eq(pointages.chantierId, ligne.chantierId));
        } else {
          conditions.push(isNull(pointages.chantierId));
        }
        const deleted = await tx
          .update(pointages)
          .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
          .where(and(...conditions))
          .returning({ id: pointages.id });
        deletedCount += deleted.length;
      }

      let insertedCount = 0;
      if (toInsert.length > 0) {
        const inserted = await tx
          .insert(pointages)
          .values(toInsert)
          .returning({ id: pointages.id });
        insertedCount = inserted.length;
      }

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'pointages',
        rowId: `matrice-${annee}-${mois}`,
        before: { deletedCount },
        after: {
          insertedCount,
          lignes: lignes.length,
          mois,
          annee,
        },
      });

      return { inserted: insertedCount, deleted: deletedCount };
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/pointages`);
    revalidatePath(`/${ctx.entreprise.slug}/rh/pointages/saisie`);
    revalidatePath(`/${ctx.entreprise.slug}/rh`);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof Error && /uq_pointages/.test(err.message)) {
      return {
        ok: false,
        error: 'Doublon détecté pendant l\'insertion (pointage déjà existant pour ce couple).',
      };
    }
    throw err;
  }
}
