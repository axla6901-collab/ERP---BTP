'use server';

import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { sirhCompteurAjustements, sirhCompteurs, sirhTypesAbsence } from '@/db/schema/test-sirh';
import {
  ajustementSchema,
  compteurSchema,
  initialisationCompteursSchema,
  type AjustementInput,
  type CompteurInput,
  type InitialisationCompteursInput,
} from '@/lib/validation/test-sirh/absences';

import { employeExiste } from '../acces';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

/**
 * Server actions — compteurs de droits (Factorial Allowance) et ajustements
 * manuels (AllowanceIncidence). Réservées à la gestion RH (admin / RH).
 */

type Issue<T> =
  | { type: 'ok'; data: T }
  | { type: 'erreur'; message: string }
  | { type: 'champ'; champ: string; message: string };

function versResultat<T>(r: Exclude<Issue<T>, { type: 'ok' }>): ActionResult<T> {
  if (r.type === 'champ') {
    return { ok: false, error: r.message, fieldErrors: { [r.champ]: [r.message] } };
  }
  return { ok: false, error: r.message };
}

/**
 * Le type d'absence existe et est décompté d'un compteur (et actif si
 * `exigerActif`) ; sinon message d'erreur.
 */
async function verifierTypeAvecSolde(
  tx: TenantTx,
  typeAbsenceId: string,
  exigerActif = false,
): Promise<string | null> {
  const [type] = await tx
    .select({ actif: sirhTypesAbsence.actif, avecSolde: sirhTypesAbsence.avecSolde })
    .from(sirhTypesAbsence)
    .where(and(eq(sirhTypesAbsence.id, typeAbsenceId), isNull(sirhTypesAbsence.deletedAt)));
  if (!type) return 'Type d’absence introuvable.';
  if (!type.avecSolde) {
    return 'Ce type d’absence n’est pas décompté d’un compteur (option « avec solde » désactivée).';
  }
  if (exigerActif && !type.actif) return 'Ce type d’absence est désactivé.';
  return null;
}

/** Crée (sans `id`) ou met à jour (avec `id`) un compteur de droits. */
export async function enregistrerCompteur(
  input: CompteurInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = compteurSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const colonnes = {
    employeId: data.employeId,
    typeAbsenceId: data.typeAbsenceId,
    periodeDebut: data.periodeDebut,
    periodeFin: data.periodeFin,
    droitsAcquis: data.droitsAcquis,
    report: data.report,
    notes: data.notes,
  };

  try {
    const r = await withTenant(ctx.entreprise.id, async (tx): Promise<Issue<{ id: string }>> => {
      if (!(await employeExiste(tx, data.employeId))) {
        return { type: 'champ', champ: 'employeId', message: 'Employé introuvable.' };
      }
      const erreurType = await verifierTypeAvecSolde(tx, data.typeAbsenceId);
      if (erreurType) return { type: 'champ', champ: 'typeAbsenceId', message: erreurType };

      const recouvrants = await tx
        .select({ id: sirhCompteurs.id })
        .from(sirhCompteurs)
        .where(
          and(
            eq(sirhCompteurs.employeId, data.employeId),
            eq(sirhCompteurs.typeAbsenceId, data.typeAbsenceId),
            isNull(sirhCompteurs.deletedAt),
            lte(sirhCompteurs.periodeDebut, data.periodeFin),
            gte(sirhCompteurs.periodeFin, data.periodeDebut),
          ),
        );
      if (recouvrants.some((c) => c.id !== data.id)) {
        return {
          type: 'erreur',
          message:
            'Un compteur de cet employé couvre déjà tout ou partie de cette période pour ce type.',
        };
      }

      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhCompteurs)
          .where(and(eq(sirhCompteurs.id, data.id), isNull(sirhCompteurs.deletedAt)));
        if (!before) return { type: 'erreur', message: 'Compteur introuvable.' };
        await tx
          .update(sirhCompteurs)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhCompteurs.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_compteurs',
          rowId: data.id,
          before,
          after: data,
        });
        return { type: 'ok', data: { id: data.id } };
      }

      const [inserted] = await tx
        .insert(sirhCompteurs)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhCompteurs.id });
      if (!inserted) throw new Error('INSERT sirh_compteurs échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_compteurs',
        rowId: inserted.id,
        after: data,
      });
      return { type: 'ok', data: { id: inserted.id } };
    });
    if (r.type !== 'ok') return versResultat(r);
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: r.data };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un compteur existe déjà pour cet employé, ce type et cette date de début.',
      controle: 'Période ou droits incohérents (droits ≥ 0, fin ≥ début).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete) d'un compteur et de ses ajustements (lignes filles
 * en cascade) — aucune autre table ne référence un compteur : les absences
 * restent intactes, seul le suivi du solde disparaît.
 */
export async function supprimerCompteur(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhCompteurs)
      .where(and(eq(sirhCompteurs.id, id), isNull(sirhCompteurs.deletedAt)));
    if (!before) return false;
    const maintenant = new Date();
    const ajustements = await tx
      .update(sirhCompteurAjustements)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(
        and(eq(sirhCompteurAjustements.compteurId, id), isNull(sirhCompteurAjustements.deletedAt)),
      )
      .returning({ id: sirhCompteurAjustements.id });
    await tx
      .update(sirhCompteurs)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhCompteurs.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_compteurs', rowId: id, before });
    for (const a of ajustements) {
      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'sirh_compteur_ajustements',
        rowId: a.id,
        after: { suppressionCompteur: id },
      });
    }
    return true;
  });
  if (!supprime) return { ok: false, error: 'Compteur introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/** Ajoute un ajustement signé (+ crédit / − débit) à un compteur. */
export async function ajouterAjustement(
  input: AjustementInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = ajustementSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [compteur] = await tx
        .select({ id: sirhCompteurs.id })
        .from(sirhCompteurs)
        .where(and(eq(sirhCompteurs.id, data.compteurId), isNull(sirhCompteurs.deletedAt)));
      if (!compteur) return null;
      const [inserted] = await tx
        .insert(sirhCompteurAjustements)
        .values({
          entrepriseId: ctx.entreprise.id,
          compteurId: data.compteurId,
          dateAjustement: data.dateAjustement,
          valeur: data.valeur,
          motif: data.motif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhCompteurAjustements.id });
      if (!inserted) throw new Error('INSERT sirh_compteur_ajustements échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_compteur_ajustements',
        rowId: inserted.id,
        after: data,
      });
      return inserted.id;
    });
    if (!id) return { ok: false, error: 'Compteur introuvable.' };
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: { id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'La valeur d’un ajustement ne peut pas être nulle.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Suppression (soft-delete) d'un ajustement. */
export async function supprimerAjustement(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhCompteurAjustements)
      .where(and(eq(sirhCompteurAjustements.id, id), isNull(sirhCompteurAjustements.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhCompteurAjustements)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhCompteurAjustements.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_compteur_ajustements',
      rowId: id,
      before,
    });
    return true;
  });
  if (!supprime) return { ok: false, error: 'Ajustement introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/**
 * « Initialiser les compteurs » : crée, pour un type avec solde et une période,
 * le compteur de chaque employé ACTIF qui n'en a pas encore (aucun compteur de
 * ce type chevauchant la période). Renvoie le nombre de créés / ignorés.
 */
export async function initialiserCompteurs(
  input: InitialisationCompteursInput,
): Promise<ActionResult<{ crees: number; ignores: number }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = initialisationCompteursSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const r = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<Issue<{ crees: number; ignores: number }>> => {
        const erreurType = await verifierTypeAvecSolde(tx, data.typeAbsenceId, true);
        if (erreurType) return { type: 'champ', champ: 'typeAbsenceId', message: erreurType };

        const actifs = await tx
          .select({ id: employes.id })
          .from(employes)
          .where(and(isNull(employes.deletedAt), eq(employes.actif, true)));
        const existants = await tx
          .select({ employeId: sirhCompteurs.employeId })
          .from(sirhCompteurs)
          .where(
            and(
              eq(sirhCompteurs.typeAbsenceId, data.typeAbsenceId),
              isNull(sirhCompteurs.deletedAt),
              lte(sirhCompteurs.periodeDebut, data.periodeFin),
              gte(sirhCompteurs.periodeFin, data.periodeDebut),
            ),
          );
        const dejaPourvus = new Set(existants.map((e) => e.employeId));
        const aCreer = actifs.filter((e) => !dejaPourvus.has(e.id));

        if (aCreer.length > 0) {
          const inserted = await tx
            .insert(sirhCompteurs)
            .values(
              aCreer.map((e) => ({
                entrepriseId: ctx.entreprise.id,
                employeId: e.id,
                typeAbsenceId: data.typeAbsenceId,
                periodeDebut: data.periodeDebut,
                periodeFin: data.periodeFin,
                droitsAcquis: data.droitsAcquis,
                report: '0',
                notes: null,
                createdBy: ctx.utilisateur.id,
                updatedBy: ctx.utilisateur.id,
              })),
            )
            .returning({ id: sirhCompteurs.id, employeId: sirhCompteurs.employeId });
          for (const c of inserted) {
            await auditLogIn(tx, {
              action: 'insert',
              tableName: 'sirh_compteurs',
              rowId: c.id,
              after: { ...data, employeId: c.employeId, initialisation: true },
            });
          }
        }
        return {
          type: 'ok',
          data: { crees: aCreer.length, ignores: actifs.length - aCreer.length },
        };
      },
    );
    if (r.type !== 'ok') return versResultat(r);
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: r.data };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un compteur existe déjà pour un employé à cette date de début : relancez la page.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}
