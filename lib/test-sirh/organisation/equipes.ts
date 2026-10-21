'use server';

import { and, count, eq, gte, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import {
  sirhAnnonces,
  sirhEquipeMembres,
  sirhEquipes,
  sirhPeriodesBloquees,
  sirhSites,
} from '@/db/schema/test-sirh';
import {
  equipeSchema,
  membreEquipeSchema,
  type EquipeInput,
  type MembreEquipeInput,
} from '@/lib/validation/test-sirh/organisation';

import { employeExiste } from '../acces';
import { aujourdhuiIso } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/**
 * Server actions — Test SIRH › Organisation › Équipes (Factorial teams/Team +
 * Membership). Gestion réservée à ROLES_SIRH_GESTION.
 */

function invalide(fieldErrors: Record<string, string[] | undefined>): ActionResult<never> {
  return {
    ok: false,
    error: 'Données invalides.',
    fieldErrors: fieldErrors as Record<string, string[]>,
  };
}

function erreurChamp(champ: string, message: string): ActionResult<never> {
  return { ok: false, error: message, fieldErrors: { [champ]: [message] } };
}

function revaliderEquipes(base: string) {
  revalidatePath(`${base}/organisation/equipes`);
  revalidatePath(`${base}/collaborateurs`);
}

/** Colonnes métier d'une équipe, dérivées de l'input validé. */
function colonnesEquipe(data: EquipeInput) {
  return {
    nom: data.nom,
    description: data.description,
    responsableId: data.responsableId,
    siteId: data.siteId,
    couleur: data.couleur,
    actif: data.actif,
  };
}

/** Crée (sans `id`) ou met à jour (avec `id`) une équipe. */
export async function enregistrerEquipe(input: EquipeInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = equipeSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  try {
    const resultat = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<ActionResult<{ id: string }>> => {
        // Isolation tenant : les FK ignorent la RLS, on vérifie chaque référence.
        if (data.responsableId && !(await employeExiste(tx, data.responsableId))) {
          return erreurChamp('responsableId', 'Responsable introuvable.');
        }
        if (data.siteId) {
          const [site] = await tx
            .select({ id: sirhSites.id })
            .from(sirhSites)
            .where(and(eq(sirhSites.id, data.siteId), isNull(sirhSites.deletedAt)));
          if (!site) return erreurChamp('siteId', 'Site introuvable.');
        }

        if (data.id) {
          const [before] = await tx
            .select()
            .from(sirhEquipes)
            .where(and(eq(sirhEquipes.id, data.id), isNull(sirhEquipes.deletedAt)));
          if (!before) return { ok: false, error: 'Équipe introuvable.' };
          await tx
            .update(sirhEquipes)
            .set({ ...colonnesEquipe(data), updatedBy: ctx.utilisateur.id })
            .where(eq(sirhEquipes.id, data.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_equipes',
            rowId: data.id,
            before,
            after: data,
          });
          return { ok: true, data: { id: data.id } };
        }

        const [inserted] = await tx
          .insert(sirhEquipes)
          .values({
            entrepriseId: ctx.entreprise.id,
            ...colonnesEquipe(data),
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhEquipes.id });
        if (!inserted) throw new Error('INSERT sirh_equipes échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_equipes',
          rowId: inserted.id,
          after: data,
        });
        return { ok: true, data: { id: inserted.id } };
      },
    );
    if (resultat.ok) revaliderEquipes(baseSirh(ctx));
    return resultat;
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Une équipe porte déjà ce nom.',
      controle: 'Couleur invalide (#RRGGBB).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete). Refusée si l'équipe a encore des membres en
 * vigueur (actuels ou à venir), des périodes bloquées ou des annonces ciblées —
 * la désactiver sinon.
 */
export async function supprimerEquipe(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const today = aujourdhuiIso();

  const resultat = await withTenant(ctx.entreprise.id, async (tx): Promise<ActionResult> => {
    const [before] = await tx
      .select()
      .from(sirhEquipes)
      .where(and(eq(sirhEquipes.id, id), isNull(sirhEquipes.deletedAt)));
    if (!before) return { ok: false, error: 'Équipe introuvable.' };

    const [membres] = await tx
      .select({ n: count() })
      .from(sirhEquipeMembres)
      .where(
        and(
          eq(sirhEquipeMembres.equipeId, id),
          isNull(sirhEquipeMembres.deletedAt),
          or(isNull(sirhEquipeMembres.dateFin), gte(sirhEquipeMembres.dateFin, today)),
        ),
      );
    const [periodes] = await tx
      .select({ n: count() })
      .from(sirhPeriodesBloquees)
      .where(and(eq(sirhPeriodesBloquees.equipeId, id), isNull(sirhPeriodesBloquees.deletedAt)));
    const [annonces] = await tx
      .select({ n: count() })
      .from(sirhAnnonces)
      .where(and(eq(sirhAnnonces.equipeId, id), isNull(sirhAnnonces.deletedAt)));

    const blocage = messageBlocageSuppression(
      'cette équipe',
      [
        { nombre: membres?.n ?? 0, singulier: 'membre actif', pluriel: 'membres actifs' },
        {
          nombre: periodes?.n ?? 0,
          singulier: 'période bloquée',
          pluriel: 'périodes bloquées',
        },
        { nombre: annonces?.n ?? 0, singulier: 'annonce', pluriel: 'annonces' },
      ],
      { feminin: true },
    );
    if (blocage) return { ok: false, error: blocage };

    const maintenant = new Date();
    // Appartenances terminées : supprimées avec l'équipe (miroir du ON DELETE CASCADE).
    const historique = await tx
      .select()
      .from(sirhEquipeMembres)
      .where(and(eq(sirhEquipeMembres.equipeId, id), isNull(sirhEquipeMembres.deletedAt)));
    for (const membre of historique) {
      await tx
        .update(sirhEquipeMembres)
        .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhEquipeMembres.id, membre.id));
      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'sirh_equipe_membres',
        rowId: membre.id,
        before: membre,
      });
    }

    await tx
      .update(sirhEquipes)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhEquipes.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_equipes', rowId: id, before });
    return { ok: true, data: undefined };
  });

  if (resultat.ok) revaliderEquipes(baseSirh(ctx));
  return resultat;
}

/** Ajoute (sans `id`) ou modifie (avec `id`) l'appartenance d'un collaborateur à une équipe. */
export async function enregistrerMembreEquipe(
  input: MembreEquipeInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = membreEquipeSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  try {
    const resultat = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<ActionResult<{ id: string }>> => {
        const [equipe] = await tx
          .select({ id: sirhEquipes.id })
          .from(sirhEquipes)
          .where(and(eq(sirhEquipes.id, data.equipeId), isNull(sirhEquipes.deletedAt)));
        if (!equipe) return { ok: false, error: 'Équipe introuvable.' };
        if (!(await employeExiste(tx, data.employeId))) {
          return erreurChamp('employeId', 'Collaborateur introuvable.');
        }

        const colonnes = {
          employeId: data.employeId,
          estResponsable: data.estResponsable,
          dateDebut: data.dateDebut,
          dateFin: data.dateFin,
        };

        if (data.id) {
          const [before] = await tx
            .select()
            .from(sirhEquipeMembres)
            .where(
              and(
                eq(sirhEquipeMembres.id, data.id),
                eq(sirhEquipeMembres.equipeId, data.equipeId),
                isNull(sirhEquipeMembres.deletedAt),
              ),
            );
          if (!before) return { ok: false, error: 'Membre introuvable.' };
          await tx
            .update(sirhEquipeMembres)
            .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
            .where(eq(sirhEquipeMembres.id, data.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_equipe_membres',
            rowId: data.id,
            before,
            after: data,
          });
          return { ok: true, data: { id: data.id } };
        }

        const [inserted] = await tx
          .insert(sirhEquipeMembres)
          .values({
            entrepriseId: ctx.entreprise.id,
            equipeId: data.equipeId,
            ...colonnes,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhEquipeMembres.id });
        if (!inserted) throw new Error('INSERT sirh_equipe_membres échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_equipe_membres',
          rowId: inserted.id,
          after: data,
        });
        return { ok: true, data: { id: inserted.id } };
      },
    );
    if (resultat.ok) {
      const base = baseSirh(ctx);
      revaliderEquipes(base);
      revalidatePath(`${base}/collaborateurs/${data.employeId}`);
    }
    return resultat;
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Ce collaborateur est déjà membre de cette équipe.',
      controle: 'La date de fin doit être postérieure ou égale à la date de début.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Retire un membre d'une équipe (soft-delete de l'appartenance). */
export async function retirerMembreEquipe(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);

  const resultat = await withTenant(
    ctx.entreprise.id,
    async (tx): Promise<ActionResult<{ employeId: string }>> => {
      const [before] = await tx
        .select()
        .from(sirhEquipeMembres)
        .where(and(eq(sirhEquipeMembres.id, id), isNull(sirhEquipeMembres.deletedAt)));
      if (!before) return { ok: false, error: 'Membre introuvable.' };
      await tx
        .update(sirhEquipeMembres)
        .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
        .where(eq(sirhEquipeMembres.id, id));
      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'sirh_equipe_membres',
        rowId: id,
        before,
      });
      return { ok: true, data: { employeId: before.employeId } };
    },
  );

  if (!resultat.ok) return resultat;
  const base = baseSirh(ctx);
  revaliderEquipes(base);
  revalidatePath(`${base}/collaborateurs/${resultat.data.employeId}`);
  return { ok: true, data: undefined };
}
