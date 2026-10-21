'use server';

import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhBadgeages } from '@/db/schema/test-sirh';
import {
  badgeageSchema,
  validationSemaineSchema,
  type BadgeageInput,
  type ValidationSemaineInput,
} from '@/lib/validation/test-sirh/temps';

import { employeExiste, employeIdDeLUtilisateur } from '../acces';
import { ajouterJours } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { formatHeure } from '../format';
import { peutGererSirh, ROLES_SIRH_VALIDATION } from '../permissions';

import { chantierExiste, estUuid } from './controles';
import { trouverChevauchement } from './feuille-temps';

/**
 * Server actions — Test SIRH › Temps de travail › Badgeages (Factorial
 * attendance/Shift). Saisie et validation : gestionnaires RH ou valideurs
 * (`ROLES_SIRH_VALIDATION` ⊇ `ROLES_SIRH_GESTION`). Un valideur non RH ne valide
 * pas ses propres badgeages.
 */

const ROLES_SAISIE_BADGEAGE = ROLES_SIRH_VALIDATION;

const MESSAGE_PROPRE_FICHE = 'Vous ne pouvez pas valider vos propres badgeages.';

function colonnesBadgeage(data: BadgeageInput) {
  return {
    employeId: data.employeId,
    dateBadgeage: data.dateBadgeage,
    heureDebut: data.heureDebut,
    heureFin: data.heureFin,
    pauseMinutes: data.pauseMinutes,
    lieu: data.lieu,
    chantierId: data.chantierId,
    commentaire: data.commentaire,
  };
}

const hhmm = (h: string | null) => (h ? h.slice(0, 5) : null);

/** Crée (sans `id`) ou met à jour (avec `id`) un badgeage. Modifier les horaires invalide la validation. */
export async function enregistrerBadgeage(
  input: BadgeageInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SAISIE_BADGEAGE);
  const parsed = badgeageSchema.safeParse(input);
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
      if (!(await employeExiste(tx, data.employeId))) {
        return { type: 'erreur' as const, message: 'Employé introuvable.' };
      }
      if (data.chantierId && !(await chantierExiste(tx, data.chantierId))) {
        return { type: 'erreur' as const, message: 'Chantier introuvable.' };
      }

      let before: typeof sirhBadgeages.$inferSelect | undefined;
      if (data.id) {
        [before] = await tx
          .select()
          .from(sirhBadgeages)
          .where(and(eq(sirhBadgeages.id, data.id), isNull(sirhBadgeages.deletedAt)));
        if (!before) return { type: 'erreur' as const, message: 'Badgeage introuvable.' };
      }

      const memeJour = await tx
        .select({
          id: sirhBadgeages.id,
          heureDebut: sirhBadgeages.heureDebut,
          heureFin: sirhBadgeages.heureFin,
        })
        .from(sirhBadgeages)
        .where(
          and(
            eq(sirhBadgeages.employeId, data.employeId),
            eq(sirhBadgeages.dateBadgeage, data.dateBadgeage),
            isNull(sirhBadgeages.deletedAt),
          ),
        );
      const conflit = trouverChevauchement(data, memeJour, data.id ?? null);
      if (conflit) {
        return {
          type: 'erreur' as const,
          message: `Ce badgeage chevauche celui de ${formatHeure(conflit.heureDebut)} – ${
            conflit.heureFin ? formatHeure(conflit.heureFin) : 'en cours'
          } le même jour.`,
        };
      }

      if (data.id && before) {
        const horairesModifies =
          before.employeId !== data.employeId ||
          before.dateBadgeage !== data.dateBadgeage ||
          hhmm(before.heureDebut) !== data.heureDebut ||
          hhmm(before.heureFin) !== data.heureFin ||
          before.pauseMinutes !== data.pauseMinutes;
        await tx
          .update(sirhBadgeages)
          .set({
            ...colonnesBadgeage(data),
            ...(horairesModifies ? { valide: false, validePar: null, valideLe: null } : {}),
            updatedBy: ctx.utilisateur.id,
          })
          .where(eq(sirhBadgeages.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_badgeages',
          rowId: data.id,
          before,
          after: data,
        });
        return { type: 'ok' as const, id: data.id };
      }

      const [inserted] = await tx
        .insert(sirhBadgeages)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnesBadgeage(data),
          source: 'manuel',
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhBadgeages.id });
      if (!inserted) throw new Error('INSERT sirh_badgeages échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_badgeages',
        rowId: inserted.id,
        after: data,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revalidatePath(`${baseSirh(ctx)}/temps`);
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Badgeage incohérent (pause comprise entre 0 et 720 minutes).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Suppression (soft-delete) d'un badgeage. */
export async function supprimerBadgeage(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SAISIE_BADGEAGE);
  if (!estUuid(id)) return { ok: false, error: 'Badgeage introuvable.' };

  const ok = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhBadgeages)
      .where(and(eq(sirhBadgeages.id, id), isNull(sirhBadgeages.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhBadgeages)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhBadgeages.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_badgeages', rowId: id, before });
    return true;
  });

  if (!ok) return { ok: false, error: 'Badgeage introuvable.' };
  revalidatePath(`${baseSirh(ctx)}/temps`);
  return { ok: true, data: undefined };
}

/** Valide un badgeage terminé (`valide`, `valide_par`, `valide_le`). Idempotent. */
export async function validerBadgeage(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_VALIDATION);
  if (!estUuid(id)) return { ok: false, error: 'Badgeage introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhBadgeages)
      .where(and(eq(sirhBadgeages.id, id), isNull(sirhBadgeages.deletedAt)));
    if (!before) return 'Badgeage introuvable.';
    if (!before.heureFin) {
      return 'Badgeage en cours : renseignez l’heure de fin avant de le valider.';
    }
    if (!peutGererSirh(ctx.utilisateur.role)) {
      const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
      if (moi === before.employeId) return MESSAGE_PROPRE_FICHE;
    }
    if (before.valide) return null;
    const after = { valide: true, validePar: ctx.utilisateur.id, valideLe: new Date() };
    await tx
      .update(sirhBadgeages)
      .set({ ...after, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhBadgeages.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_badgeages',
      rowId: id,
      before,
      after,
    });
    return null;
  });

  if (resultat) return { ok: false, error: resultat };
  revalidatePath(`${baseSirh(ctx)}/temps`);
  return { ok: true, data: undefined };
}

/**
 * « Valider la semaine » : valide tous les badgeages TERMINÉS et non validés du
 * collaborateur entre `lundi` et le dimanche suivant.
 */
export async function validerSemaineBadgeages(
  input: ValidationSemaineInput,
): Promise<ActionResult<{ nbValides: number }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_VALIDATION);
  const parsed = validationSemaineSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { employeId, lundi } = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await employeExiste(tx, employeId))) {
      return { type: 'erreur' as const, message: 'Employé introuvable.' };
    }
    if (!peutGererSirh(ctx.utilisateur.role)) {
      const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
      if (moi === employeId) return { type: 'erreur' as const, message: MESSAGE_PROPRE_FICHE };
    }
    const valideLe = new Date();
    const valides = await tx
      .update(sirhBadgeages)
      .set({
        valide: true,
        validePar: ctx.utilisateur.id,
        valideLe,
        updatedBy: ctx.utilisateur.id,
      })
      .where(
        and(
          eq(sirhBadgeages.employeId, employeId),
          isNull(sirhBadgeages.deletedAt),
          eq(sirhBadgeages.valide, false),
          isNotNull(sirhBadgeages.heureFin),
          gte(sirhBadgeages.dateBadgeage, lundi),
          lte(sirhBadgeages.dateBadgeage, ajouterJours(lundi, 6)),
        ),
      )
      .returning({ id: sirhBadgeages.id });
    for (const v of valides) {
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_badgeages',
        rowId: v.id,
        before: { valide: false },
        after: { valide: true, validePar: ctx.utilisateur.id, valideLe },
      });
    }
    return { type: 'ok' as const, nb: valides.length };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revalidatePath(`${baseSirh(ctx)}/temps`);
  return { ok: true, data: { nbValides: resultat.nb } };
}
