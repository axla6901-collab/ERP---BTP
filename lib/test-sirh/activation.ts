'use server';

import { count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { peutAdministrer } from '@/lib/admin/permissions';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { entreprises } from '@/db/schema/entreprises';
import {
  sirhDossiersDocuments,
  sirhFormations,
  sirhHoraires,
  sirhJoursFeries,
  sirhModeleTaches,
  sirhModelesProcessus,
  sirhTypesAbsence,
} from '@/db/schema/test-sirh';
import { sirhFlagSchema, type SirhFlagInput } from '@/lib/validation/test-sirh/commun';

import {
  DOSSIERS_DEFAUT,
  FORMATIONS_DEFAUT,
  HORAIRES_DEFAUT,
  MODELES_PROCESSUS_DEFAUT,
  TYPES_ABSENCE_DEFAUT,
  joursFeriesAAmorcer,
} from './amorcage';
import { aujourdhuiIso } from './calendrier';

/** Nombre de lignes non supprimées d'une table SIRH pour le tenant courant (RLS). */
async function compter(
  tx: TenantTx,
  table:
    | typeof sirhTypesAbsence
    | typeof sirhHoraires
    | typeof sirhDossiersDocuments
    | typeof sirhModelesProcessus
    | typeof sirhFormations
    | typeof sirhJoursFeries,
): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(table).where(isNull(table.deletedAt));
  return row?.n ?? 0;
}

/**
 * Amorce les référentiels par défaut — uniquement dans les tables encore vides
 * (idempotent : une réactivation ne duplique rien et ne touche pas aux données saisies).
 * Renvoie le détail de ce qui a été créé.
 */
async function amorcerReferentiels(
  tx: TenantTx,
  entrepriseId: string,
  utilisateurId: string,
): Promise<Record<string, number>> {
  const cree: Record<string, number> = {};
  const audit = { createdBy: utilisateurId, updatedBy: utilisateurId };

  if ((await compter(tx, sirhTypesAbsence)) === 0) {
    await tx
      .insert(sirhTypesAbsence)
      .values(TYPES_ABSENCE_DEFAUT.map((t) => ({ entrepriseId, ...t, ...audit })));
    cree.typesAbsence = TYPES_ABSENCE_DEFAUT.length;
  }

  if ((await compter(tx, sirhHoraires)) === 0) {
    await tx.insert(sirhHoraires).values(
      HORAIRES_DEFAUT.map((h) => ({
        entrepriseId,
        nom: h.nom,
        description: h.description,
        heuresLundi: h.heures.lundi,
        heuresMardi: h.heures.mardi,
        heuresMercredi: h.heures.mercredi,
        heuresJeudi: h.heures.jeudi,
        heuresVendredi: h.heures.vendredi,
        heuresSamedi: h.heures.samedi,
        heuresDimanche: h.heures.dimanche,
        parDefaut: h.parDefaut,
        ...audit,
      })),
    );
    cree.horaires = HORAIRES_DEFAUT.length;
  }

  if ((await compter(tx, sirhDossiersDocuments)) === 0) {
    await tx
      .insert(sirhDossiersDocuments)
      .values(DOSSIERS_DEFAUT.map((d) => ({ entrepriseId, ...d, ...audit })));
    cree.dossiersDocuments = DOSSIERS_DEFAUT.length;
  }

  if ((await compter(tx, sirhModelesProcessus)) === 0) {
    for (const modele of MODELES_PROCESSUS_DEFAUT) {
      const [m] = await tx
        .insert(sirhModelesProcessus)
        .values({
          entrepriseId,
          nom: modele.nom,
          typeProcessus: modele.typeProcessus,
          description: modele.description,
          ...audit,
        })
        .returning({ id: sirhModelesProcessus.id });
      if (!m) throw new Error('INSERT sirh_modeles_processus échoué.');
      await tx.insert(sirhModeleTaches).values(
        modele.taches.map((t, i) => ({
          entrepriseId,
          modeleId: m.id,
          libelle: t.libelle,
          description: t.description ?? null,
          responsable: t.responsable,
          delaiJours: t.delaiJours,
          ordre: (i + 1) * 10,
          ...audit,
        })),
      );
    }
    cree.modelesProcessus = MODELES_PROCESSUS_DEFAUT.length;
  }

  if ((await compter(tx, sirhFormations)) === 0) {
    await tx
      .insert(sirhFormations)
      .values(FORMATIONS_DEFAUT.map((f) => ({ entrepriseId, ...f, ...audit })));
    cree.formations = FORMATIONS_DEFAUT.length;
  }

  if ((await compter(tx, sirhJoursFeries)) === 0) {
    const feries = joursFeriesAAmorcer(aujourdhuiIso());
    await tx
      .insert(sirhJoursFeries)
      .values(
        feries.map((f) => ({ entrepriseId, dateFerie: f.date, libelle: f.libelle, ...audit })),
      );
    cree.joursFeries = feries.length;
  }

  return cree;
}

/**
 * Bascule l'option « Test SIRH » pour l'entreprise courante (admin tenant),
 * même patron que `setFlotteAutomobileActive`. À l'activation, amorce les
 * référentiels par défaut (types d'absence, horaires, dossiers GED, modèles
 * d'onboarding, formations réglementaires BTP, jours fériés N et N+1).
 */
export async function setTestSirhActive(
  input: SirhFlagInput,
): Promise<ActionResult<{ testSirhActive: boolean; amorce: Record<string, number> }>> {
  const parsed = sirhFlagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const ctx = await requireTenantContextWithMfa();
  if (!peutAdministrer(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé : rôle administrateur requis.' };
  }

  const amorce = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select({ testSirhActive: entreprises.testSirhActive })
      .from(entreprises)
      .where(eq(entreprises.id, ctx.entreprise.id));
    await tx
      .update(entreprises)
      .set({ testSirhActive: parsed.data.actif, updatedAt: new Date() })
      .where(eq(entreprises.id, ctx.entreprise.id));
    const cree = parsed.data.actif
      ? await amorcerReferentiels(tx, ctx.entreprise.id, ctx.utilisateur.id)
      : {};
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'entreprises',
      rowId: ctx.entreprise.id,
      before,
      after: { testSirhActive: parsed.data.actif, amorce: cree },
    });
    return cree;
  });

  revalidatePath(`/${ctx.entreprise.slug}`, 'layout');
  return { ok: true, data: { testSirhActive: parsed.data.actif, amorce } };
}
