'use server';

import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhModeleTaches,
  sirhModelesProcessus,
  sirhProcessus,
  sirhTaches,
} from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import {
  lancerProcessusSchema,
  statutProcessusSchema,
  type LancerProcessusInput,
  type StatutProcessusInput,
} from '@/lib/validation/test-sirh/onboarding';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

import { managerDeLEmploye, utilisateurDeLEmploye } from './comptes';
import {
  materialiserTaches,
  STATUTS_TACHE_OUVERTS,
  transitionProcessusAutorisee,
  type AssignationsParDefaut,
} from './planification';

/**
 * Server actions — Test SIRH › Onboarding : processus lancés pour un
 * collaborateur (Factorial processes/MaterializedProcess).
 */

/**
 * Lance un processus depuis un modèle ACTIF : crée `sirh_processus` et
 * matérialise les tâches du modèle (échéance = date de référence + délai,
 * responsable copié, ordre) dans UNE transaction. Assignation automatique
 * optionnelle : tâches RH → lanceur, salarié / manager → leur compte s'il existe.
 */
export async function lancerProcessus(
  input: LancerProcessusInput,
): Promise<ActionResult<{ id: string; nbTaches: number }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = lancerProcessusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const [modele] = await tx
        .select({
          id: sirhModelesProcessus.id,
          typeProcessus: sirhModelesProcessus.typeProcessus,
          actif: sirhModelesProcessus.actif,
        })
        .from(sirhModelesProcessus)
        .where(
          and(eq(sirhModelesProcessus.id, data.modeleId), isNull(sirhModelesProcessus.deletedAt)),
        );
      if (!modele) return { type: 'erreur' as const, message: 'Modèle introuvable.' };
      if (!modele.actif) {
        return { type: 'erreur' as const, message: 'Ce modèle est désactivé : réactivez-le.' };
      }

      const [employe] = await tx
        .select({ id: employes.id })
        .from(employes)
        .where(and(eq(employes.id, data.employeId), isNull(employes.deletedAt)));
      if (!employe) return { type: 'erreur' as const, message: 'Collaborateur introuvable.' };

      const [doublon] = await tx
        .select({ id: sirhProcessus.id })
        .from(sirhProcessus)
        .where(
          and(
            eq(sirhProcessus.modeleId, modele.id),
            eq(sirhProcessus.employeId, employe.id),
            eq(sirhProcessus.statut, 'en_cours'),
            isNull(sirhProcessus.deletedAt),
          ),
        )
        .limit(1);
      if (doublon) {
        return {
          type: 'erreur' as const,
          message: 'Un processus issu de ce modèle est déjà en cours pour ce collaborateur.',
        };
      }

      const modeleTaches = await tx
        .select({
          libelle: sirhModeleTaches.libelle,
          description: sirhModeleTaches.description,
          responsable: sirhModeleTaches.responsable,
          delaiJours: sirhModeleTaches.delaiJours,
          ordre: sirhModeleTaches.ordre,
        })
        .from(sirhModeleTaches)
        .where(and(eq(sirhModeleTaches.modeleId, modele.id), isNull(sirhModeleTaches.deletedAt)))
        .orderBy(asc(sirhModeleTaches.ordre));

      let assignations: AssignationsParDefaut = {};
      if (data.assignationAuto) {
        const managerId = await managerDeLEmploye(tx, employe.id);
        assignations = {
          rh: ctx.utilisateur.id,
          salarie: await utilisateurDeLEmploye(tx, ctx.entreprise.id, employe.id),
          manager: managerId ? await utilisateurDeLEmploye(tx, ctx.entreprise.id, managerId) : null,
        };
      }
      const planifiees = materialiserTaches(modeleTaches, data.dateReference, assignations);

      const [processus] = await tx
        .insert(sirhProcessus)
        .values({
          entrepriseId: ctx.entreprise.id,
          modeleId: modele.id,
          employeId: employe.id,
          typeProcessus: modele.typeProcessus,
          libelle: data.libelle,
          dateReference: data.dateReference,
          statut: 'en_cours',
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhProcessus.id });
      if (!processus) throw new Error('INSERT sirh_processus échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_processus',
        rowId: processus.id,
        after: { ...data, typeProcessus: modele.typeProcessus, nbTaches: planifiees.length },
      });

      if (planifiees.length > 0) {
        const valeurs = planifiees.map((t) => ({
          entrepriseId: ctx.entreprise.id,
          processusId: processus.id,
          employeId: employe.id,
          libelle: t.libelle,
          description: t.description,
          responsable: t.responsable,
          assigneA: t.assigneA,
          echeance: t.echeance,
          statut: 'a_faire' as const,
          ordre: t.ordre,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        }));
        const inserees = await tx
          .insert(sirhTaches)
          .values(valeurs)
          .returning({ id: sirhTaches.id });
        for (const [i, ligne] of inserees.entries()) {
          await auditLogIn(tx, {
            action: 'insert',
            tableName: 'sirh_taches',
            rowId: ligne.id,
            after: valeurs[i],
          });
        }
      }
      return { type: 'ok' as const, id: processus.id, nbTaches: planifiees.length };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: { id: resultat.id, nbTaches: resultat.nbTaches } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      reference: 'Modèle ou collaborateur introuvable.',
      controle: 'Échéances incohérentes : vérifiez la date de référence.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Change le statut d'un processus : terminer ou annuler un processus en
 * cours (ses tâches encore ouvertes passent « annulées »), ou rouvrir un
 * processus clos (les tâches restent en l'état).
 */
export async function changerStatutProcessus(
  input: StatutProcessusInput,
): Promise<ActionResult<{ tachesAnnulees: number }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = statutProcessusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { id, statut } = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhProcessus)
      .where(and(eq(sirhProcessus.id, id), isNull(sirhProcessus.deletedAt)));
    if (!before) return { type: 'erreur' as const, message: 'Processus introuvable.' };
    if (!transitionProcessusAutorisee(before.statut, statut)) {
      return { type: 'erreur' as const, message: 'Changement de statut impossible.' };
    }

    await tx
      .update(sirhProcessus)
      .set({ statut, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhProcessus.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_processus',
      rowId: id,
      before,
      after: { statut },
    });

    let tachesAnnulees = 0;
    if (statut !== 'en_cours') {
      const annulees = await tx
        .update(sirhTaches)
        .set({ statut: 'annulee', dateRealisation: null, updatedBy: ctx.utilisateur.id })
        .where(
          and(
            eq(sirhTaches.processusId, id),
            isNull(sirhTaches.deletedAt),
            inArray(sirhTaches.statut, [...STATUTS_TACHE_OUVERTS]),
          ),
        )
        .returning({ id: sirhTaches.id });
      for (const t of annulees) {
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_taches',
          rowId: t.id,
          after: { statut: 'annulee', motif: `processus ${statut}` },
        });
      }
      tachesAnnulees = annulees.length;
    }
    return { type: 'ok' as const, tachesAnnulees };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: { tachesAnnulees: resultat.tachesAnnulees } };
}

/** Supprime (soft-delete) un processus et toutes ses tâches. */
export async function supprimerProcessus(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!uuidRequis().safeParse(id).success) return { ok: false, error: 'Processus introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhProcessus)
      .where(and(eq(sirhProcessus.id, id), isNull(sirhProcessus.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const maintenant = new Date();
    const taches = await tx
      .update(sirhTaches)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(and(eq(sirhTaches.processusId, id), isNull(sirhTaches.deletedAt)))
      .returning({ id: sirhTaches.id });
    for (const t of taches) {
      await auditLogIn(tx, { action: 'delete', tableName: 'sirh_taches', rowId: t.id });
    }
    await tx
      .update(sirhProcessus)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhProcessus.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_processus', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Processus introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}
