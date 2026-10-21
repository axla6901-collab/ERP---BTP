'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { chantiers } from '@/db/schema/chantiers';
import { sirhDocuments, sirhNotesFrais } from '@/db/schema/test-sirh';
import { decisionSchema, type DecisionInput } from '@/lib/validation/test-sirh/commun';
import type { StatutFrais } from '@/lib/validation/test-sirh/enums';
import {
  noteFraisSchema,
  remboursementNoteFraisSchema,
  type NoteFraisInput,
} from '@/lib/validation/test-sirh/notes-frais';

import { peutAgirPourEmploye } from '../acces';
import { aujourdhuiIso } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { formatDateFr } from '../format';
import { ROLES_SIRH_GESTION, ROLES_SIRH_PAIE, ROLES_SIRH_VALIDATION } from '../permissions';
import { acteurNoteFrais } from './acteur';
import {
  droitsNoteFrais,
  normaliserMontantsNoteFrais,
  statutApresDecision,
  statutApresEnregistrement,
} from './calculs';

/**
 * Server actions — Test SIRH › Notes de frais (Factorial expenses).
 *
 * Workflow : brouillon → soumise → approuvée | refusée → remboursée.
 * - Saisie / soumission : libre-service (tout rôle, pour SA fiche employé) ou
 *   gestion RH pour tous (`peutAgirPourEmploye`).
 * - Décision : valideurs (`ROLES_SIRH_VALIDATION`), jamais sur sa propre note
 *   (sauf administrateur).
 * - Remboursement : paie ou gestion (admin, RH, comptable).
 * - Suppression : brouillon uniquement, par son auteur (ou un gestionnaire RH).
 */

/** Paie ∪ gestion : rôles autorisés à marquer une note remboursée. */
const ROLES_REMBOURSEMENT = [...new Set([...ROLES_SIRH_PAIE, ...ROLES_SIRH_GESTION])];

const MESSAGES_CONTRAINTES = {
  controle:
    'Montants incohérents (TVA supérieure au TTC, distance ou nombre de forfaits nul, puissance fiscale hors bornes).',
  reference: 'Collaborateur, chantier ou justificatif introuvable.',
};

type ResultatEcriture =
  | { type: 'ok'; id: string; statut: StatutFrais }
  | { type: 'refuse' }
  | { type: 'introuvable' }
  | { type: 'verrouillee' }
  | { type: 'chantier' }
  | { type: 'justificatif' };

/** Création / mise à jour commune au brouillon et à la soumission. */
async function enregistrerNote(
  input: NoteFraisInput,
  soumettre: boolean,
): Promise<ActionResult<{ id: string; statut: StatutFrais }>> {
  const ctx = await exigerContexteSirhAction();
  const parsed = noteFraisSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  if (data.dateDepense > aujourdhuiIso()) {
    return {
      ok: false,
      error: 'La date de la dépense ne peut pas être dans le futur.',
      fieldErrors: { dateDepense: ['Date dans le futur.'] },
    };
  }
  const montants = normaliserMontantsNoteFrais(data);
  const colonnes = {
    employeId: data.employeId,
    dateDepense: data.dateDepense,
    nature: data.nature,
    categorie: data.categorie,
    libelle: data.libelle,
    ...montants,
    chantierId: data.chantierId,
    justificatifDocumentId: data.justificatifDocumentId,
  };

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx): Promise<ResultatEcriture> => {
      if (!(await peutAgirPourEmploye(tx, ctx, data.employeId))) return { type: 'refuse' };

      if (data.chantierId) {
        const [chantier] = await tx
          .select({ id: chantiers.id })
          .from(chantiers)
          .where(and(eq(chantiers.id, data.chantierId), isNull(chantiers.deletedAt)));
        if (!chantier) return { type: 'chantier' };
      }
      if (data.justificatifDocumentId) {
        // Le justificatif doit être une pièce du même salarié (pas celle d'un collègue).
        const [doc] = await tx
          .select({ id: sirhDocuments.id, employeId: sirhDocuments.employeId })
          .from(sirhDocuments)
          .where(
            and(eq(sirhDocuments.id, data.justificatifDocumentId), isNull(sirhDocuments.deletedAt)),
          );
        if (!doc || doc.employeId !== data.employeId) return { type: 'justificatif' };
      }

      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhNotesFrais)
          .where(and(eq(sirhNotesFrais.id, data.id), isNull(sirhNotesFrais.deletedAt)));
        if (!before) return { type: 'introuvable' };
        if (
          before.employeId !== data.employeId &&
          !(await peutAgirPourEmploye(tx, ctx, before.employeId))
        ) {
          return { type: 'refuse' };
        }
        const statut = statutApresEnregistrement(before.statut, soumettre);
        if (!statut) return { type: 'verrouillee' };
        await tx
          .update(sirhNotesFrais)
          .set({ ...colonnes, statut, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhNotesFrais.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_notes_frais',
          rowId: data.id,
          before,
          after: { ...colonnes, statut },
        });
        return { type: 'ok', id: data.id, statut };
      }

      const statut: StatutFrais = soumettre ? 'soumise' : 'brouillon';
      const [inserted] = await tx
        .insert(sirhNotesFrais)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          statut,
          demandePar: ctx.utilisateur.id,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhNotesFrais.id });
      if (!inserted) throw new Error('INSERT sirh_notes_frais échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_notes_frais',
        rowId: inserted.id,
        after: { ...colonnes, statut },
      });
      return { type: 'ok', id: inserted.id, statut };
    });

    switch (resultat.type) {
      case 'refuse':
        return { ok: false, error: 'Accès refusé : vous ne pouvez saisir que vos propres frais.' };
      case 'introuvable':
        return { ok: false, error: 'Note de frais introuvable.' };
      case 'verrouillee':
        return {
          ok: false,
          error:
            'Cette note a déjà été traitée (approuvée, refusée ou remboursée) : modification impossible.',
        };
      case 'chantier':
        return {
          ok: false,
          error: 'Chantier introuvable.',
          fieldErrors: { chantierId: ['Chantier introuvable.'] },
        };
      case 'justificatif':
        return {
          ok: false,
          error: 'Justificatif invalide (pièce introuvable ou rattachée à un autre salarié).',
          fieldErrors: { justificatifDocumentId: ['Justificatif invalide.'] },
        };
      case 'ok':
        revalidatePath(baseSirh(ctx), 'layout');
        return { ok: true, data: { id: resultat.id, statut: resultat.statut } };
    }
  } catch (err) {
    const message = messageErreurContrainte(err, MESSAGES_CONTRAINTES);
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Enregistre (crée ou met à jour) une note en BROUILLON — libre-service ou gestion RH. */
export async function enregistrerBrouillonNoteFrais(
  input: NoteFraisInput,
): Promise<ActionResult<{ id: string; statut: StatutFrais }>> {
  return enregistrerNote(input, false);
}

/**
 * Enregistre (crée ou met à jour) une note et la SOUMET à validation.
 * Appelable par tout rôle pour SA fiche employé (Mon espace), ou par la
 * gestion RH pour n'importe quel salarié.
 */
export async function soumettreNoteFrais(
  input: NoteFraisInput,
): Promise<ActionResult<{ id: string; statut: StatutFrais }>> {
  return enregistrerNote(input, true);
}

/** Soumet à validation un brouillon existant (bouton « Soumettre » d'une liste). */
export async function soumettreBrouillonNoteFrais(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: 'Note de frais invalide.' };
  }

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhNotesFrais)
      .where(and(eq(sirhNotesFrais.id, id), isNull(sirhNotesFrais.deletedAt)));
    if (!before) return 'introuvable' as const;
    if (before.statut !== 'brouillon') return 'statut' as const;
    const droits = droitsNoteFrais(before, await acteurNoteFrais(tx, ctx));
    if (!droits.soumettre) return 'refuse' as const;
    await tx
      .update(sirhNotesFrais)
      .set({ statut: 'soumise', updatedBy: ctx.utilisateur.id })
      .where(eq(sirhNotesFrais.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_notes_frais',
      rowId: id,
      before,
      after: { statut: 'soumise' },
    });
    return 'ok' as const;
  });

  if (resultat === 'introuvable') return { ok: false, error: 'Note de frais introuvable.' };
  if (resultat === 'statut') return { ok: false, error: 'Seul un brouillon peut être soumis.' };
  if (resultat === 'refuse') return { ok: false, error: 'Accès refusé.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/** Décision d'un valideur (approuver / refuser + commentaire) sur une note soumise. */
export async function deciderNoteFrais(input: DecisionInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_VALIDATION);
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhNotesFrais)
      .where(and(eq(sirhNotesFrais.id, data.id), isNull(sirhNotesFrais.deletedAt)));
    if (!before) return 'introuvable' as const;
    if (before.statut !== 'soumise') return 'statut' as const;
    const droits = droitsNoteFrais(before, await acteurNoteFrais(tx, ctx));
    if (!droits.decider) return 'soi' as const;

    const apres = {
      statut: statutApresDecision(data.decision),
      valideurId: ctx.utilisateur.id,
      dateDecision: new Date(),
      commentaireDecision: data.commentaire,
    };
    await tx
      .update(sirhNotesFrais)
      .set({ ...apres, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhNotesFrais.id, data.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_notes_frais',
      rowId: data.id,
      before,
      after: apres,
    });
    return 'ok' as const;
  });

  if (resultat === 'introuvable') return { ok: false, error: 'Note de frais introuvable.' };
  if (resultat === 'statut') {
    return { ok: false, error: 'Cette note n’est plus en attente de validation.' };
  }
  if (resultat === 'soi') {
    return { ok: false, error: 'Vous ne pouvez pas statuer sur votre propre note de frais.' };
  }
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/** « Marquer remboursée » (paie ou gestion) : note approuvée → remboursée à la date donnée. */
export async function marquerNoteFraisRemboursee(
  id: string,
  dateRemboursement: string,
): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_REMBOURSEMENT);
  const parsed = remboursementNoteFraisSchema.safeParse({ id, dateRemboursement });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhNotesFrais)
      .where(and(eq(sirhNotesFrais.id, data.id), isNull(sirhNotesFrais.deletedAt)));
    if (!before) return { type: 'introuvable' as const };
    if (before.statut !== 'approuvee') return { type: 'statut' as const };
    if (data.dateRemboursement < before.dateDepense) {
      return { type: 'date' as const, dateDepense: before.dateDepense };
    }
    const apres = { statut: 'remboursee' as const, dateRemboursement: data.dateRemboursement };
    await tx
      .update(sirhNotesFrais)
      .set({ ...apres, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhNotesFrais.id, data.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_notes_frais',
      rowId: data.id,
      before,
      after: apres,
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Note de frais introuvable.' };
  if (resultat.type === 'statut') {
    return { ok: false, error: 'Seule une note approuvée peut être marquée remboursée.' };
  }
  if (resultat.type === 'date') {
    return {
      ok: false,
      error: `La date de remboursement doit être postérieure à la dépense (${formatDateFr(resultat.dateDepense)}).`,
      fieldErrors: { dateRemboursement: ['Date antérieure à la dépense.'] },
    };
  }
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/**
 * Suppression (soft-delete) d'un BROUILLON par son auteur (ou un gestionnaire
 * RH). Un brouillon n'est jamais importé en paie : aucune référence à compter.
 */
export async function supprimerNoteFrais(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction();
  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: 'Note de frais invalide.' };
  }

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhNotesFrais)
      .where(and(eq(sirhNotesFrais.id, id), isNull(sirhNotesFrais.deletedAt)));
    if (!before) return 'introuvable' as const;
    if (before.statut !== 'brouillon') return 'statut' as const;
    const droits = droitsNoteFrais(before, await acteurNoteFrais(tx, ctx));
    if (!droits.supprimer) return 'refuse' as const;
    await tx
      .update(sirhNotesFrais)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhNotesFrais.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_notes_frais', rowId: id, before });
    return 'ok' as const;
  });

  if (resultat === 'introuvable') return { ok: false, error: 'Note de frais introuvable.' };
  if (resultat === 'statut') {
    return {
      ok: false,
      error: 'Seul un brouillon peut être supprimé (une note soumise se refuse).',
    };
  }
  if (resultat === 'refuse') {
    return { ok: false, error: 'Seul l’auteur du brouillon peut le supprimer.' };
  }
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}
