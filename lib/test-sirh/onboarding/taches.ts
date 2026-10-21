'use server';

import { and, eq, isNull, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { TenantContext } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhProcessus, sirhTaches } from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import type { StatutTache } from '@/lib/validation/test-sirh/enums';
import {
  basculerTacheSchema,
  statutTacheSchema,
  tacheSchema,
  type StatutTacheInput,
  type TacheInput,
} from '@/lib/validation/test-sirh/onboarding';

import { employeExiste } from '../acces';
import { aujourdhuiIso } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { peutGererSirh, ROLES_SIRH_GESTION } from '../permissions';

import { estUtilisateurMembre } from './comptes';
import { ordreSuivant, transitionCoche, transitionStatut, type EtatTache } from './planification';

/**
 * Server actions — Test SIRH › Onboarding : tâches RH (Factorial tasks/Task).
 *
 * Écriture réservée aux gestionnaires RH, SAUF l'avancement (cocher, changer
 * le statut) d'une tâche assignée à l'utilisateur courant : ouvert à tous les
 * rôles (réutilisé dans « Mon espace »).
 */

type Erreur = { type: 'erreur'; message: string };

function invalide(error: { flatten: () => { fieldErrors: unknown } }): ActionResult<never> {
  return {
    ok: false,
    error: 'Données invalides.',
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

/** Avancement d'une tâche : gestionnaire RH, ou tâche assignée à l'utilisateur. */
function peutFaireAvancer(ctx: TenantContext, tache: { assigneA: string | null }): boolean {
  return peutGererSirh(ctx.utilisateur.role) || tache.assigneA === ctx.utilisateur.id;
}

const MESSAGE_NON_ASSIGNEE = 'Accès refusé : cette tâche ne vous est pas assignée.';

/**
 * Coche (→ « faite », réalisée aujourd'hui) ou décoche (→ « à faire ») une
 * tâche. Tous rôles pour une tâche qui leur est assignée ; toutes les tâches
 * pour les gestionnaires RH.
 */
export async function basculerTache(id: string, faite: boolean): Promise<ActionResult<EtatTache>> {
  const ctx = await exigerContexteSirhAction();
  const parsed = basculerTacheSchema.safeParse({ id, faite });
  if (!parsed.success) return invalide(parsed.error);
  const today = aujourdhuiIso();

  const resultat = await withTenant(ctx.entreprise.id, async (tx): Promise<Erreur | EtatTache> => {
    const [before] = await tx
      .select()
      .from(sirhTaches)
      .where(and(eq(sirhTaches.id, parsed.data.id), isNull(sirhTaches.deletedAt)));
    if (!before) return { type: 'erreur', message: 'Tâche introuvable.' };
    if (!peutFaireAvancer(ctx, before)) return { type: 'erreur', message: MESSAGE_NON_ASSIGNEE };
    if (before.statut === 'annulee') {
      return { type: 'erreur', message: 'Tâche annulée : changez d’abord son statut.' };
    }

    const etat = transitionCoche(parsed.data.faite, today);
    await tx
      .update(sirhTaches)
      .set({ ...etat, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhTaches.id, before.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_taches',
      rowId: before.id,
      before,
      after: etat,
    });
    return etat;
  });

  if ('type' in resultat) return { ok: false, error: resultat.message };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: resultat };
}

/**
 * Changement de statut rapide. Même règle d'accès que `basculerTache` ;
 * seul un gestionnaire RH peut annuler une tâche ou rouvrir une tâche annulée.
 */
export async function changerStatutTache(
  input: StatutTacheInput,
): Promise<ActionResult<EtatTache>> {
  const ctx = await exigerContexteSirhAction();
  const parsed = statutTacheSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const today = aujourdhuiIso();
  const gestion = peutGererSirh(ctx.utilisateur.role);

  const resultat = await withTenant(ctx.entreprise.id, async (tx): Promise<Erreur | EtatTache> => {
    const [before] = await tx
      .select()
      .from(sirhTaches)
      .where(and(eq(sirhTaches.id, parsed.data.id), isNull(sirhTaches.deletedAt)));
    if (!before) return { type: 'erreur', message: 'Tâche introuvable.' };
    if (!peutFaireAvancer(ctx, before)) return { type: 'erreur', message: MESSAGE_NON_ASSIGNEE };
    if (!gestion && (parsed.data.statut === 'annulee' || before.statut === 'annulee')) {
      return {
        type: 'erreur',
        message: 'Seul un gestionnaire RH peut annuler ou rouvrir une tâche annulée.',
      };
    }

    const etat = transitionStatut(parsed.data.statut, today, before.dateRealisation);
    await tx
      .update(sirhTaches)
      .set({ ...etat, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhTaches.id, before.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_taches',
      rowId: before.id,
      before,
      after: etat,
    });
    return etat;
  });

  if ('type' in resultat) return { ok: false, error: resultat.message };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: resultat };
}

/**
 * Crée (sans `id`) ou modifie (avec `id`) une tâche : ad hoc dans un
 * processus en cours (ajoutée en fin de checklist, collaborateur du processus)
 * ou autonome (sans processus, collaborateur optionnel). Le statut se change
 * par `basculerTache` / `changerStatutTache`.
 */
export async function enregistrerTache(input: TacheInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = tacheSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const data = parsed.data;

  try {
    const resultat = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<Erreur | { type: 'ok'; id: string }> => {
        if (data.assigneA && !(await estUtilisateurMembre(tx, ctx.entreprise.id, data.assigneA))) {
          return { type: 'erreur', message: 'Utilisateur assigné introuvable dans l’entreprise.' };
        }
        const colonnes = {
          libelle: data.libelle,
          description: data.description,
          responsable: data.responsable,
          assigneA: data.assigneA,
          echeance: data.echeance,
        };

        if (data.id) {
          const [before] = await tx
            .select()
            .from(sirhTaches)
            .where(and(eq(sirhTaches.id, data.id), isNull(sirhTaches.deletedAt)));
          if (!before) return { type: 'erreur', message: 'Tâche introuvable.' };
          // Une tâche de processus garde le collaborateur du processus.
          let employeId = before.employeId;
          if (!before.processusId) {
            if (data.employeId && !(await employeExiste(tx, data.employeId))) {
              return { type: 'erreur', message: 'Collaborateur introuvable.' };
            }
            employeId = data.employeId;
          }
          const apres = { ...colonnes, employeId };
          await tx
            .update(sirhTaches)
            .set({ ...apres, updatedBy: ctx.utilisateur.id })
            .where(eq(sirhTaches.id, before.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_taches',
            rowId: before.id,
            before,
            after: apres,
          });
          return { type: 'ok', id: before.id };
        }

        let employeId = data.employeId;
        let ordre = 0;
        if (data.processusId) {
          const [processus] = await tx
            .select({
              id: sirhProcessus.id,
              employeId: sirhProcessus.employeId,
              statut: sirhProcessus.statut,
            })
            .from(sirhProcessus)
            .where(and(eq(sirhProcessus.id, data.processusId), isNull(sirhProcessus.deletedAt)));
          if (!processus) return { type: 'erreur', message: 'Processus introuvable.' };
          if (processus.statut !== 'en_cours') {
            return {
              type: 'erreur',
              message: 'Ce processus est clos : rouvrez-le pour y ajouter une tâche.',
            };
          }
          employeId = processus.employeId;
          const [dernier] = await tx
            .select({ ordre: max(sirhTaches.ordre) })
            .from(sirhTaches)
            .where(and(eq(sirhTaches.processusId, processus.id), isNull(sirhTaches.deletedAt)));
          ordre = ordreSuivant(dernier?.ordre != null ? [dernier.ordre] : []);
        } else if (employeId && !(await employeExiste(tx, employeId))) {
          return { type: 'erreur', message: 'Collaborateur introuvable.' };
        }

        const valeurs = {
          ...colonnes,
          processusId: data.processusId,
          employeId,
          ordre,
          statut: 'a_faire' as StatutTache,
        };
        const [inseree] = await tx
          .insert(sirhTaches)
          .values({
            entrepriseId: ctx.entreprise.id,
            ...valeurs,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhTaches.id });
        if (!inseree) throw new Error('INSERT sirh_taches échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_taches',
          rowId: inseree.id,
          after: valeurs,
        });
        return { type: 'ok', id: inseree.id };
      },
    );

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      reference: 'Processus, collaborateur ou utilisateur introuvable.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Supprime (soft-delete) une tâche. */
export async function supprimerTache(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!uuidRequis().safeParse(id).success) return { ok: false, error: 'Tâche introuvable.' };

  const supprimee = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhTaches)
      .where(and(eq(sirhTaches.id, id), isNull(sirhTaches.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhTaches)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhTaches.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_taches', rowId: id, before });
    return true;
  });

  if (!supprimee) return { ok: false, error: 'Tâche introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}
