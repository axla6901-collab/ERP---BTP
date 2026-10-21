'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { societes } from '@/db/schema/societes';
import { sirhCollaborateurs, sirhHoraires, sirhPostes, sirhSites } from '@/db/schema/test-sirh';
import {
  affectationSchema,
  type AffectationInput,
} from '@/lib/validation/test-sirh/collaborateurs';

import { employeExiste } from '../acces';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';
import { creeUnCycleHierarchique } from './hierarchie';

/**
 * Server action — affectation SIRH d'un collaborateur (`sirh_collaborateurs`,
 * une ligne par employé) : poste, site, manager, horaire, société employeuse,
 * coordonnées professionnelles, date d'ancienneté. Gestion réservée à
 * ROLES_SIRH_GESTION.
 */

function erreurChamp(champ: string, message: string): ActionResult<never> {
  return { ok: false, error: message, fieldErrors: { [champ]: [message] } };
}

/** Crée ou met à jour (upsert) l'affectation d'un collaborateur. */
export async function enregistrerAffectation(
  input: AffectationInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = affectationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const resultat = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<ActionResult<{ id: string }>> => {
        if (!(await employeExiste(tx, data.employeId))) {
          return { ok: false, error: 'Collaborateur introuvable.' };
        }

        // Isolation tenant : chaque référence est vérifiée sous RLS.
        if (data.posteId) {
          const [poste] = await tx
            .select({ id: sirhPostes.id })
            .from(sirhPostes)
            .where(and(eq(sirhPostes.id, data.posteId), isNull(sirhPostes.deletedAt)));
          if (!poste) return erreurChamp('posteId', 'Poste introuvable.');
        }
        if (data.siteId) {
          const [site] = await tx
            .select({ id: sirhSites.id })
            .from(sirhSites)
            .where(and(eq(sirhSites.id, data.siteId), isNull(sirhSites.deletedAt)));
          if (!site) return erreurChamp('siteId', 'Site introuvable.');
        }
        if (data.horaireId) {
          const [horaire] = await tx
            .select({ id: sirhHoraires.id })
            .from(sirhHoraires)
            .where(and(eq(sirhHoraires.id, data.horaireId), isNull(sirhHoraires.deletedAt)));
          if (!horaire) return erreurChamp('horaireId', 'Horaire introuvable.');
        }
        if (data.societeId) {
          const [societe] = await tx
            .select({ id: societes.id })
            .from(societes)
            .where(and(eq(societes.id, data.societeId), isNull(societes.deletedAt)));
          if (!societe) return erreurChamp('societeId', 'Société introuvable.');
        }
        if (data.managerId) {
          if (!(await employeExiste(tx, data.managerId))) {
            return erreurChamp('managerId', 'Manager introuvable.');
          }
          const liens = await tx
            .select({
              employeId: sirhCollaborateurs.employeId,
              managerId: sirhCollaborateurs.managerId,
            })
            .from(sirhCollaborateurs)
            .where(isNull(sirhCollaborateurs.deletedAt));
          const managers = new Map(liens.map((l) => [l.employeId, l.managerId]));
          if (creeUnCycleHierarchique(data.employeId, data.managerId, managers)) {
            return erreurChamp(
              'managerId',
              'Ce manager est déjà placé sous la responsabilité de ce collaborateur (boucle hiérarchique).',
            );
          }
        }

        const colonnes = {
          posteId: data.posteId,
          siteId: data.siteId,
          managerId: data.managerId,
          horaireId: data.horaireId,
          societeId: data.societeId,
          emailProfessionnel: data.emailProfessionnel,
          telephoneProfessionnel: data.telephoneProfessionnel,
          dateAnciennete: data.dateAnciennete,
          notes: data.notes,
        };

        const [before] = await tx
          .select()
          .from(sirhCollaborateurs)
          .where(
            and(
              eq(sirhCollaborateurs.employeId, data.employeId),
              isNull(sirhCollaborateurs.deletedAt),
            ),
          );
        if (before) {
          await tx
            .update(sirhCollaborateurs)
            .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
            .where(eq(sirhCollaborateurs.id, before.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_collaborateurs',
            rowId: before.id,
            before,
            after: data,
          });
          return { ok: true, data: { id: before.id } };
        }

        const [inserted] = await tx
          .insert(sirhCollaborateurs)
          .values({
            entrepriseId: ctx.entreprise.id,
            employeId: data.employeId,
            ...colonnes,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhCollaborateurs.id });
        if (!inserted) throw new Error('INSERT sirh_collaborateurs échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_collaborateurs',
          rowId: inserted.id,
          after: data,
        });
        return { ok: true, data: { id: inserted.id } };
      },
    );
    if (resultat.ok) {
      const base = baseSirh(ctx);
      revalidatePath(`${base}/collaborateurs`);
      revalidatePath(`${base}/collaborateurs/${data.employeId}`);
    }
    return resultat;
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Une affectation existe déjà pour ce collaborateur (réessayez).',
      controle: 'Données incohérentes (manager identique au collaborateur ou email invalide).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}
