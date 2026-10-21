'use server';

import { and, count, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhCampagnesEntretiens,
  sirhCollaborateurs,
  sirhEntretiens,
  sirhEquipeMembres,
  sirhEquipes,
  sirhSites,
} from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import {
  campagneSchema,
  changementStatutCampagneSchema,
  lancementCampagneSchema,
  type CampagneInput,
  type LancementCampagneInput,
} from '@/lib/validation/test-sirh/entretiens';
import { LIBELLES_STATUT_CAMPAGNE, type StatutCampagne } from '@/lib/validation/test-sirh/enums';

import { aujourdhuiIso } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';
import { campagneLancable, transitionCampagneAutorisee } from './statuts';

/**
 * Server actions — Test SIRH › Entretiens › Campagnes (Factorial
 * performance/ReviewProcess). Réservées à la gestion RH.
 */

const idSchema = uuidRequis('Campagne');

function revaliderCampagnes(base: string) {
  revalidatePath(`${base}/entretiens`);
  revalidatePath(`${base}/entretiens/liste`);
  revalidatePath(`${base}/entretiens/suivi`);
  revalidatePath(base);
}

/** Crée (sans `id`) ou met à jour (avec `id`) une campagne d'entretiens. */
export async function enregistrerCampagne(
  input: CampagneInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = campagneSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const colonnes = {
    libelle: data.libelle,
    typeEntretien: data.typeEntretien,
    dateDebut: data.dateDebut,
    dateLimite: data.dateLimite,
    description: data.description,
  };

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhCampagnesEntretiens)
          .where(
            and(eq(sirhCampagnesEntretiens.id, data.id), isNull(sirhCampagnesEntretiens.deletedAt)),
          );
        if (!before) return { type: 'introuvable' as const };
        if (before.typeEntretien !== data.typeEntretien) {
          const [row] = await tx
            .select({ n: count() })
            .from(sirhEntretiens)
            .where(and(eq(sirhEntretiens.campagneId, data.id), isNull(sirhEntretiens.deletedAt)));
          if ((row?.n ?? 0) > 0) {
            return {
              type: 'refus' as const,
              message:
                'Le type ne peut plus être modifié : la campagne contient déjà des entretiens.',
            };
          }
        }
        await tx
          .update(sirhCampagnesEntretiens)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhCampagnesEntretiens.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_campagnes_entretiens',
          rowId: data.id,
          before,
          after: data,
        });
        return { type: 'ok' as const, id: data.id };
      }

      const [inserted] = await tx
        .insert(sirhCampagnesEntretiens)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          statut: 'brouillon',
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhCampagnesEntretiens.id });
      if (!inserted) throw new Error('INSERT sirh_campagnes_entretiens échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_campagnes_entretiens',
        rowId: inserted.id,
        after: data,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'introuvable') return { ok: false, error: 'Campagne introuvable.' };
    if (resultat.type === 'refus') return { ok: false, error: resultat.message };
    revaliderCampagnes(baseSirh(ctx));
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'La date limite doit être postérieure à la date de début.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete) refusée tant que la campagne contient des
 * entretiens (règle de suppression référentielle) — la clôturer sinon.
 */
export async function supprimerCampagne(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Campagne introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhCampagnesEntretiens)
      .where(and(eq(sirhCampagnesEntretiens.id, id), isNull(sirhCampagnesEntretiens.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const [row] = await tx
      .select({ n: count() })
      .from(sirhEntretiens)
      .where(and(eq(sirhEntretiens.campagneId, id), isNull(sirhEntretiens.deletedAt)));
    const blocage = messageBlocageSuppression(
      'cette campagne',
      [{ nombre: row?.n ?? 0, singulier: 'entretien', pluriel: 'entretiens' }],
      { feminin: true },
    );
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(sirhCampagnesEntretiens)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhCampagnesEntretiens.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_campagnes_entretiens',
      rowId: id,
      before,
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Campagne introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revaliderCampagnes(baseSirh(ctx));
  return { ok: true, data: undefined };
}

/**
 * « Lancer la campagne » : crée un entretien « à planifier » par employé actif
 * (filtrés par site et/ou équipe), avec pour évaluateur son manager
 * (`sirh_collaborateurs.manager_id`). Idempotent : un employé qui a déjà un
 * entretien dans la campagne est ignoré (index unique campagne × employé).
 * La campagne passe « en cours ».
 */
export async function lancerCampagne(
  input: LancementCampagneInput,
): Promise<ActionResult<{ crees: number; existants: number }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = lancementCampagneSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const today = aujourdhuiIso();

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    // Verrou : deux lancements simultanés ne se chevauchent pas.
    const [campagne] = await tx
      .select()
      .from(sirhCampagnesEntretiens)
      .where(
        and(
          eq(sirhCampagnesEntretiens.id, data.campagneId),
          isNull(sirhCampagnesEntretiens.deletedAt),
        ),
      )
      .for('update');
    if (!campagne) return { type: 'erreur' as const, message: 'Campagne introuvable.' };
    if (!campagneLancable(campagne.statut)) {
      return {
        type: 'erreur' as const,
        message: 'Campagne clôturée : rouvrez-la avant de la relancer.',
      };
    }
    if (data.siteId) {
      const [site] = await tx
        .select({ id: sirhSites.id })
        .from(sirhSites)
        .where(and(eq(sirhSites.id, data.siteId), isNull(sirhSites.deletedAt)));
      if (!site) return { type: 'erreur' as const, message: 'Site introuvable.' };
    }
    if (data.equipeId) {
      const [equipe] = await tx
        .select({ id: sirhEquipes.id })
        .from(sirhEquipes)
        .where(and(eq(sirhEquipes.id, data.equipeId), isNull(sirhEquipes.deletedAt)));
      if (!equipe) return { type: 'erreur' as const, message: 'Équipe introuvable.' };
    }

    const manager = alias(employes, 'manager');
    const conditions = [isNull(employes.deletedAt), eq(employes.actif, true)];
    if (data.siteId) conditions.push(eq(sirhCollaborateurs.siteId, data.siteId));
    if (data.equipeId) {
      conditions.push(
        inArray(
          employes.id,
          tx
            .select({ id: sirhEquipeMembres.employeId })
            .from(sirhEquipeMembres)
            .where(
              and(
                eq(sirhEquipeMembres.equipeId, data.equipeId),
                isNull(sirhEquipeMembres.deletedAt),
                or(isNull(sirhEquipeMembres.dateFin), gte(sirhEquipeMembres.dateFin, today)),
              ),
            ),
        ),
      );
    }
    const cibles = await tx
      .select({ employeId: employes.id, managerId: manager.id })
      .from(employes)
      .leftJoin(
        sirhCollaborateurs,
        and(eq(sirhCollaborateurs.employeId, employes.id), isNull(sirhCollaborateurs.deletedAt)),
      )
      .leftJoin(
        manager,
        and(
          eq(manager.id, sirhCollaborateurs.managerId),
          isNull(manager.deletedAt),
          eq(manager.actif, true),
        ),
      )
      .where(and(...conditions));

    const existants = await tx
      .select({ employeId: sirhEntretiens.employeId })
      .from(sirhEntretiens)
      .where(and(eq(sirhEntretiens.campagneId, campagne.id), isNull(sirhEntretiens.deletedAt)));
    const deja = new Set(existants.map((e) => e.employeId));
    const aCreer = cibles.filter((c) => !deja.has(c.employeId));

    const crees =
      aCreer.length === 0
        ? []
        : await tx
            .insert(sirhEntretiens)
            .values(
              aCreer.map((c) => ({
                entrepriseId: ctx.entreprise.id,
                campagneId: campagne.id,
                employeId: c.employeId,
                evaluateurId: c.managerId && c.managerId !== c.employeId ? c.managerId : null,
                typeEntretien: campagne.typeEntretien,
                statut: 'a_planifier' as const,
                createdBy: ctx.utilisateur.id,
                updatedBy: ctx.utilisateur.id,
              })),
            )
            .onConflictDoNothing()
            .returning({
              id: sirhEntretiens.id,
              employeId: sirhEntretiens.employeId,
              evaluateurId: sirhEntretiens.evaluateurId,
            });
    for (const e of crees) {
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_entretiens',
        rowId: e.id,
        after: {
          campagneId: campagne.id,
          employeId: e.employeId,
          evaluateurId: e.evaluateurId,
          typeEntretien: campagne.typeEntretien,
          statut: 'a_planifier',
          origine: 'lancement_campagne',
        },
      });
    }

    // Passage « en cours » ; date de début = aujourd'hui si absente (et compatible avec la date limite).
    const dateDebut =
      campagne.dateDebut ?? (!campagne.dateLimite || campagne.dateLimite >= today ? today : null);
    if (campagne.statut !== 'en_cours' || dateDebut !== campagne.dateDebut) {
      const maj = { statut: 'en_cours' as const, dateDebut };
      await tx
        .update(sirhCampagnesEntretiens)
        .set({ ...maj, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhCampagnesEntretiens.id, campagne.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_campagnes_entretiens',
        rowId: campagne.id,
        before: campagne,
        after: maj,
      });
    }
    return { type: 'ok' as const, crees: crees.length, existants: cibles.length - crees.length };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderCampagnes(baseSirh(ctx));
  return { ok: true, data: { crees: resultat.crees, existants: resultat.existants } };
}

/** Clôture ou réouverture d'une campagne lancée. */
export async function changerStatutCampagne(
  id: string,
  statut: StatutCampagne,
): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = changementStatutCampagneSchema.safeParse({ id, statut });
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhCampagnesEntretiens)
      .where(
        and(
          eq(sirhCampagnesEntretiens.id, parsed.data.id),
          isNull(sirhCampagnesEntretiens.deletedAt),
        ),
      );
    if (!before) return { type: 'erreur' as const, message: 'Campagne introuvable.' };
    if (!transitionCampagneAutorisee(before.statut, parsed.data.statut)) {
      return {
        type: 'erreur' as const,
        message:
          before.statut === 'brouillon'
            ? 'Lancez la campagne pour générer ses entretiens.'
            : `Passage « ${LIBELLES_STATUT_CAMPAGNE[before.statut]} » → « ${LIBELLES_STATUT_CAMPAGNE[parsed.data.statut]} » impossible.`,
      };
    }
    await tx
      .update(sirhCampagnesEntretiens)
      .set({ statut: parsed.data.statut, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhCampagnesEntretiens.id, parsed.data.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_campagnes_entretiens',
      rowId: parsed.data.id,
      before,
      after: { statut: parsed.data.statut },
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderCampagnes(baseSirh(ctx));
  return { ok: true, data: undefined };
}
