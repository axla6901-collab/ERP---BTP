'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { sirhCampagnesEntretiens, sirhEntretiens, sirhObjectifs } from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import {
  commentaireSalarieSchema,
  compteRenduSchema,
  nouvelEntretienSchema,
  planificationEntretienSchema,
  type CommentaireSalarieInput,
  type CompteRenduInput,
  type NouvelEntretienInput,
  type PlanificationEntretienInput,
} from '@/lib/validation/test-sirh/entretiens';
import { LIBELLES_STATUT_ENTRETIEN } from '@/lib/validation/test-sirh/enums';

import { employeExiste, employeIdDeLUtilisateur } from '../acces';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION, ROLES_SIRH_LECTURE } from '../permissions';
import { peutEcrireEntretien } from './droits';
import {
  compteRenduVerrouille,
  entretienSupprimable,
  statutApresPlanification,
  transitionEntretienAutorisee,
} from './statuts';

/**
 * Server actions — Test SIRH › Entretiens (Factorial performance/ReviewEvaluation).
 *
 * - Création, planification, suppression : gestion RH.
 * - Compte rendu : gestion RH ou évaluateur de l'entretien.
 * - Commentaire du salarié : le salarié lui-même (« Mon espace »).
 */

const idSchema = uuidRequis('Entretien');

const MESSAGE_UNICITE_CAMPAGNE = 'Ce collaborateur a déjà un entretien dans cette campagne.';
const MESSAGE_VERROUILLE = 'Entretien signé ou annulé : le compte rendu est verrouillé.';

function revaliderEntretien(base: string, id?: string) {
  revalidatePath(`${base}/entretiens`);
  revalidatePath(`${base}/entretiens/liste`);
  revalidatePath(`${base}/entretiens/suivi`);
  if (id) revalidatePath(`${base}/entretiens/${id}`);
  revalidatePath(base);
}

function invalide(fieldErrors: Record<string, string[] | undefined>) {
  return {
    ok: false as const,
    error: 'Données invalides.',
    fieldErrors: fieldErrors as Record<string, string[]>,
  };
}

/** Vérifie (sur `tx`, donc dans le tenant) l'évaluateur désigné. */
async function verifierEvaluateur(
  tx: TenantTx,
  evaluateurId: string | null,
  employeId: string,
): Promise<string | null> {
  if (!evaluateurId) return null;
  if (evaluateurId === employeId) {
    return 'L’évaluateur doit être une autre personne que le collaborateur.';
  }
  return (await employeExiste(tx, evaluateurId)) ? null : 'Évaluateur introuvable.';
}

async function lireEntretienActif(tx: TenantTx, id: string) {
  const [row] = await tx
    .select()
    .from(sirhEntretiens)
    .where(and(eq(sirhEntretiens.id, id), isNull(sirhEntretiens.deletedAt)));
  return row ?? null;
}

/** Crée un entretien (hors campagne, ou ajouté manuellement à une campagne). */
export async function creerEntretien(
  input: NouvelEntretienInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = nouvelEntretienSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      if (!(await employeExiste(tx, data.employeId))) {
        return { type: 'erreur' as const, message: 'Collaborateur introuvable.' };
      }
      const erreurEvaluateur = await verifierEvaluateur(tx, data.evaluateurId, data.employeId);
      if (erreurEvaluateur) return { type: 'erreur' as const, message: erreurEvaluateur };
      if (data.campagneId) {
        const [campagne] = await tx
          .select({ id: sirhCampagnesEntretiens.id, statut: sirhCampagnesEntretiens.statut })
          .from(sirhCampagnesEntretiens)
          .where(
            and(
              eq(sirhCampagnesEntretiens.id, data.campagneId),
              isNull(sirhCampagnesEntretiens.deletedAt),
            ),
          );
        if (!campagne) return { type: 'erreur' as const, message: 'Campagne introuvable.' };
        if (campagne.statut === 'cloturee') {
          return { type: 'erreur' as const, message: 'Campagne clôturée : rouvrez-la d’abord.' };
        }
      }

      const valeurs = {
        campagneId: data.campagneId,
        employeId: data.employeId,
        evaluateurId: data.evaluateurId,
        typeEntretien: data.typeEntretien,
        datePrevue: data.datePrevue,
        statut: statutApresPlanification('a_planifier', data.datePrevue),
      };
      const [inserted] = await tx
        .insert(sirhEntretiens)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...valeurs,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhEntretiens.id });
      if (!inserted) throw new Error('INSERT sirh_entretiens échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_entretiens',
        rowId: inserted.id,
        after: valeurs,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderEntretien(baseSirh(ctx), resultat.id);
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, { unicite: MESSAGE_UNICITE_CAMPAGNE });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Planification (évaluateur, type, date prévue). Poser une date planifie un
 * entretien « à planifier » ; la retirer remet un entretien planifié « à planifier ».
 */
export async function planifierEntretien(
  input: PlanificationEntretienInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = planificationEntretienSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const before = await lireEntretienActif(tx, data.id);
    if (!before) return { type: 'erreur' as const, message: 'Entretien introuvable.' };
    if (compteRenduVerrouille(before.statut)) {
      return { type: 'erreur' as const, message: MESSAGE_VERROUILLE };
    }
    const erreurEvaluateur = await verifierEvaluateur(tx, data.evaluateurId, before.employeId);
    if (erreurEvaluateur) return { type: 'erreur' as const, message: erreurEvaluateur };

    const maj = {
      evaluateurId: data.evaluateurId,
      typeEntretien: data.typeEntretien,
      datePrevue: data.datePrevue,
      statut: statutApresPlanification(before.statut, data.datePrevue),
    };
    await tx
      .update(sirhEntretiens)
      .set({ ...maj, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhEntretiens.id, data.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_entretiens',
      rowId: data.id,
      before,
      after: maj,
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderEntretien(baseSirh(ctx), data.id);
  return { ok: true, data: { id: data.id } };
}

/**
 * Compte rendu de l'entretien (dates, statut, note, synthèse…). Autorisé à la
 * RH et à l'évaluateur ; le statut suit la machine à états ; un entretien
 * signé ou annulé est verrouillé.
 */
export async function enregistrerCompteRendu(
  input: CompteRenduInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const parsed = compteRenduSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const before = await lireEntretienActif(tx, data.id);
      if (!before) return { type: 'erreur' as const, message: 'Entretien introuvable.' };
      if (!(await peutEcrireEntretien(tx, ctx, before))) {
        return {
          type: 'erreur' as const,
          message: 'Seuls la RH et l’évaluateur peuvent modifier ce compte rendu.',
        };
      }
      if (compteRenduVerrouille(before.statut)) {
        return { type: 'erreur' as const, message: MESSAGE_VERROUILLE };
      }
      if (!transitionEntretienAutorisee(before.statut, data.statut)) {
        return {
          type: 'erreur' as const,
          message: `Passage « ${LIBELLES_STATUT_ENTRETIEN[before.statut]} » → « ${LIBELLES_STATUT_ENTRETIEN[data.statut]} » non autorisé.`,
        };
      }

      const maj = {
        statut: data.statut,
        datePrevue: data.datePrevue,
        dateRealisation: data.dateRealisation,
        noteGlobale: data.noteGlobale,
        synthese: data.synthese,
        pointsForts: data.pointsForts,
        axesAmelioration: data.axesAmelioration,
        souhaitsFormation: data.souhaitsFormation,
        souhaitsEvolution: data.souhaitsEvolution,
        commentaireSalarie: data.commentaireSalarie,
      };
      await tx
        .update(sirhEntretiens)
        .set({ ...maj, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhEntretiens.id, data.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_entretiens',
        rowId: data.id,
        before,
        after: maj,
      });
      return { type: 'ok' as const };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderEntretien(baseSirh(ctx), data.id);
    return { ok: true, data: { id: data.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Compte rendu incohérent (note 1 à 5, date de réalisation requise si réalisé).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Commentaire du salarié sur SON entretien (libre-service, tous rôles) :
 * possible tant que l'entretien n'est ni signé ni annulé.
 */
export async function enregistrerCommentaireSalarie(
  input: CommentaireSalarieInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction();
  const parsed = commentaireSalarieSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const before = await lireEntretienActif(tx, data.id);
    if (!before) return { type: 'erreur' as const, message: 'Entretien introuvable.' };
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!moi || moi !== before.employeId) {
      return { type: 'erreur' as const, message: 'Vous ne pouvez commenter que vos entretiens.' };
    }
    if (compteRenduVerrouille(before.statut)) {
      return { type: 'erreur' as const, message: MESSAGE_VERROUILLE };
    }
    await tx
      .update(sirhEntretiens)
      .set({ commentaireSalarie: data.commentaireSalarie, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhEntretiens.id, data.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_entretiens',
      rowId: data.id,
      before: { commentaireSalarie: before.commentaireSalarie },
      after: { commentaireSalarie: data.commentaireSalarie },
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderEntretien(baseSirh(ctx), data.id);
  revalidatePath(`${baseSirh(ctx)}/mon-espace`);
  return { ok: true, data: { id: data.id } };
}

/**
 * Suppression (soft-delete) d'un entretien non tenu. Refusée pour un entretien
 * réalisé ou signé (preuve de l'obligation légale) et tant que des objectifs y
 * sont rattachés.
 */
export async function supprimerEntretien(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Entretien introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const before = await lireEntretienActif(tx, id);
    if (!before) return { type: 'erreur' as const, message: 'Entretien introuvable.' };
    if (!entretienSupprimable(before.statut)) {
      return {
        type: 'erreur' as const,
        message: 'Un entretien réalisé ou signé est conservé : il ne peut pas être supprimé.',
      };
    }
    const [row] = await tx
      .select({ n: count() })
      .from(sirhObjectifs)
      .where(and(eq(sirhObjectifs.entretienId, id), isNull(sirhObjectifs.deletedAt)));
    const blocage = messageBlocageSuppression('cet entretien', [
      { nombre: row?.n ?? 0, singulier: 'objectif', pluriel: 'objectifs' },
    ]);
    if (blocage) return { type: 'erreur' as const, message: blocage };

    await tx
      .update(sirhEntretiens)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhEntretiens.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_entretiens', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderEntretien(baseSirh(ctx));
  return { ok: true, data: undefined };
}
