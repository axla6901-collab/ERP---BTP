'use server';

import { and, eq, isNull } from 'drizzle-orm';
import type { ZodError } from 'zod';

import { auditLogIn } from '@/lib/audit/log';
import type { TenantContext } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import {
  sirhCandidats,
  sirhCandidatureAvis,
  sirhCandidatures,
  sirhOffres,
  type SirhCandidature,
} from '@/db/schema/test-sirh';
import {
  ajoutCandidatureSchema,
  avisCandidatureSchema,
  commentaireCandidatureSchema,
  entretienCandidatureSchema,
  etapeCandidatureSchema,
  noteCandidatureSchema,
  refusCandidatureSchema,
  type AjoutCandidatureInput,
  type AvisCandidatureInput,
  type CommentaireCandidatureInput,
  type EntretienCandidatureInput,
  type EtapeCandidatureInput,
  type NoteCandidatureInput,
  type RefusCandidatureInput,
} from '@/lib/validation/test-sirh/recrutement';

import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { contrainteErreurPg, messageErreurContrainte } from '../erreurs';
import { peutGererSirh, ROLES_SIRH_GESTION, ROLES_SIRH_LECTURE } from '../permissions';
import {
  MESSAGE_EMAIL_CANDIDAT_DOUBLON,
  chargerCandidature,
  emailCandidatDejaUtilise,
  estUuid,
  revaliderRecrutement,
} from './commun-serveur';
import { instantDepuisHeureParis } from './fuseau';
import {
  estEtapeClose,
  estEtapePipeline,
  offreAccepteCandidatures,
  transitionCandidature,
} from './pipeline';

/**
 * Server actions — Test SIRH › Recrutement › Pipeline des candidatures
 * (Factorial ats/Application, HiringStage, RejectionReason, Feedback).
 *
 * Gestion RH (admin, RH) : ajout, déplacements, refus, désistement,
 * réouverture, entretien, note, commentaire, retrait. Avis des évaluateurs :
 * tout rôle ayant accès en lecture au SIRH.
 */

const MESSAGE_INTROUVABLE = 'Candidature introuvable.';
const MESSAGE_DEJA_POSITIONNE = 'Ce candidat est déjà positionné sur cette offre.';

function echecValidation(error: ZodError): {
  ok: false;
  error: string;
  fieldErrors: Record<string, string[]>;
} {
  return {
    ok: false,
    error: 'Données invalides.',
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

type PatchCandidature = Partial<
  Pick<
    typeof sirhCandidatures.$inferInsert,
    'etape' | 'motifRefus' | 'note' | 'dateEntretien' | 'commentaire'
  >
>;

/**
 * Charge la candidature (tenant), calcule la modification (règles métier),
 * l'applique, l'audite puis revalide les écrans.
 */
async function modifierCandidature(
  ctx: TenantContext,
  id: string,
  calculer: (
    avant: SirhCandidature,
  ) => { ok: true; patch: PatchCandidature } | { ok: false; message: string },
): Promise<ActionResult> {
  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const avant = await chargerCandidature(tx, id);
    if (!avant) return { ok: false as const, message: MESSAGE_INTROUVABLE };
    const calcul = calculer(avant);
    if (!calcul.ok) return calcul;
    await tx
      .update(sirhCandidatures)
      .set({ ...calcul.patch, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhCandidatures.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_candidatures',
      rowId: id,
      before: avant,
      after: calcul.patch,
    });
    return { ok: true as const };
  });
  if (!resultat.ok) return { ok: false, error: resultat.message };
  revaliderRecrutement(ctx);
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Ajout d'un candidat à une offre
// ─────────────────────────────────────────────────────────────

/** Positionne un candidat existant — ou créé à la volée — sur une offre (étape « Nouvelle »). */
export async function ajouterCandidature(
  input: AjoutCandidatureInput,
): Promise<ActionResult<{ id: string; candidatId: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = ajoutCandidatureSchema.safeParse(input);
  if (!parsed.success) return echecValidation(parsed.error);
  const data = parsed.data;

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const [offre] = await tx
        .select({ id: sirhOffres.id, statut: sirhOffres.statut })
        .from(sirhOffres)
        .where(and(eq(sirhOffres.id, data.offreId), isNull(sirhOffres.deletedAt)));
      if (!offre) return { type: 'erreur' as const, message: 'Offre introuvable.' };
      if (!offreAccepteCandidatures(offre.statut)) {
        return {
          type: 'erreur' as const,
          message: 'Offre clôturée : republiez-la pour y ajouter des candidats.',
        };
      }

      let candidatId: string;
      if (data.mode === 'existant') {
        const [candidat] = data.candidatId
          ? await tx
              .select({ id: sirhCandidats.id })
              .from(sirhCandidats)
              .where(and(eq(sirhCandidats.id, data.candidatId), isNull(sirhCandidats.deletedAt)))
          : [];
        if (!candidat) return { type: 'erreur' as const, message: 'Candidat introuvable.' };
        candidatId = candidat.id;
      } else {
        if (data.email && (await emailCandidatDejaUtilise(tx, data.email))) {
          return {
            type: 'erreur' as const,
            message: `${MESSAGE_EMAIL_CANDIDAT_DOUBLON} Choisissez-le comme candidat existant.`,
            champ: 'email',
          };
        }
        const valeurs = {
          nom: data.nom ?? '',
          prenom: data.prenom ?? '',
          email: data.email,
          telephone: data.telephone,
          source: data.source,
          consentementRgpd: data.consentementRgpd,
          dateConsentement: data.consentementRgpd ? aujourdhuiIso() : null,
        };
        const [cree] = await tx
          .insert(sirhCandidats)
          .values({
            entrepriseId: ctx.entreprise.id,
            ...valeurs,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhCandidats.id });
        if (!cree) throw new Error('INSERT sirh_candidats échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_candidats',
          rowId: cree.id,
          after: valeurs,
        });
        candidatId = cree.id;
      }

      const [existante] = await tx
        .select({ id: sirhCandidatures.id })
        .from(sirhCandidatures)
        .where(
          and(
            eq(sirhCandidatures.offreId, data.offreId),
            eq(sirhCandidatures.candidatId, candidatId),
            isNull(sirhCandidatures.deletedAt),
          ),
        );
      if (existante) return { type: 'erreur' as const, message: MESSAGE_DEJA_POSITIONNE };

      const valeursCandidature = {
        offreId: data.offreId,
        candidatId,
        etape: 'nouvelle' as const,
        dateCandidature: data.dateCandidature,
        commentaire: data.commentaire,
      };
      const [inseree] = await tx
        .insert(sirhCandidatures)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...valeursCandidature,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhCandidatures.id });
      if (!inseree) throw new Error('INSERT sirh_candidatures échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_candidatures',
        rowId: inseree.id,
        after: valeursCandidature,
      });
      return { type: 'ok' as const, id: inseree.id, candidatId };
    });

    if (resultat.type === 'erreur') {
      return {
        ok: false,
        error: resultat.message,
        ...('champ' in resultat ? { fieldErrors: { [resultat.champ]: [resultat.message] } } : {}),
      };
    }
    revaliderRecrutement(ctx);
    return { ok: true, data: { id: resultat.id, candidatId: resultat.candidatId } };
  } catch (err) {
    const doublonEmail = contrainteErreurPg(err) === 'uq_sirh_candidats_email_actif';
    const message = messageErreurContrainte(err, {
      unicite: doublonEmail ? MESSAGE_EMAIL_CANDIDAT_DOUBLON : MESSAGE_DEJA_POSITIONNE,
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Déplacements dans le pipeline
// ─────────────────────────────────────────────────────────────

/** Déplace une candidature active vers une étape du pipeline (avance ou retour). */
export async function deplacerCandidature(input: EtapeCandidatureInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = etapeCandidatureSchema.safeParse(input);
  if (!parsed.success) return echecValidation(parsed.error);
  const { id, etape } = parsed.data;
  return modifierCandidature(ctx, id, (avant) => {
    if (!estEtapePipeline(etape)) {
      return {
        ok: false,
        message: 'Refus, désistement et embauche passent par leurs actions dédiées.',
      };
    }
    const verdict = transitionCandidature(avant.etape, etape);
    if (!verdict.ok) return { ok: false, message: verdict.raison };
    return { ok: true, patch: { etape } };
  });
}

/** Refuse une candidature : motif obligatoire, commentaire éventuel ajouté au suivi. */
export async function refuserCandidature(input: RefusCandidatureInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = refusCandidatureSchema.safeParse(input);
  if (!parsed.success) return echecValidation(parsed.error);
  const { id, motifRefus, commentaire } = parsed.data;
  return modifierCandidature(ctx, id, (avant) => {
    const verdict = transitionCandidature(avant.etape, 'refusee');
    if (!verdict.ok) return { ok: false, message: verdict.raison };
    return {
      ok: true,
      patch: {
        etape: 'refusee',
        motifRefus,
        commentaire: commentaire
          ? [avant.commentaire, `Refus : ${commentaire}`].filter(Boolean).join('\n')
          : avant.commentaire,
      },
    };
  });
}

/** Le candidat se désiste (candidature close, sans motif de refus). */
export async function marquerDesistement(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!estUuid(id)) return { ok: false, error: MESSAGE_INTROUVABLE };
  return modifierCandidature(ctx, id, (avant) => {
    const verdict = transitionCandidature(avant.etape, 'desistement');
    if (!verdict.ok) return { ok: false, message: verdict.raison };
    return { ok: true, patch: { etape: 'desistement', motifRefus: null } };
  });
}

/** Réouverture explicite d'une candidature refusée / désistée vers une étape du pipeline. */
export async function rouvrirCandidature(input: EtapeCandidatureInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = etapeCandidatureSchema.safeParse(input);
  if (!parsed.success) return echecValidation(parsed.error);
  const { id, etape } = parsed.data;
  return modifierCandidature(ctx, id, (avant) => {
    const verdict = transitionCandidature(avant.etape, etape, { reouverture: true });
    if (!verdict.ok) return { ok: false, message: verdict.raison };
    return { ok: true, patch: { etape, motifRefus: null } };
  });
}

// ─────────────────────────────────────────────────────────────
// Entretien, note, commentaire
// ─────────────────────────────────────────────────────────────

/** Planifie (date + heure de Paris) ou annule (champs vides) l'entretien. */
export async function planifierEntretien(input: EntretienCandidatureInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = entretienCandidatureSchema.safeParse(input);
  if (!parsed.success) return echecValidation(parsed.error);
  const { id, date, heure } = parsed.data;
  return modifierCandidature(ctx, id, (avant) => {
    if (estEtapeClose(avant.etape)) {
      return { ok: false, message: 'Candidature close : aucun entretien à planifier.' };
    }
    const dateEntretien = date && heure ? new Date(instantDepuisHeureParis(date, heure)) : null;
    return { ok: true, patch: { dateEntretien } };
  });
}

/** Note globale de 1 à 5 (null = retirer la note). */
export async function noterCandidature(input: NoteCandidatureInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = noteCandidatureSchema.safeParse(input);
  if (!parsed.success) return echecValidation(parsed.error);
  const { id, note } = parsed.data;
  return modifierCandidature(ctx, id, () => ({ ok: true, patch: { note } }));
}

export async function commenterCandidature(
  input: CommentaireCandidatureInput,
): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = commentaireCandidatureSchema.safeParse(input);
  if (!parsed.success) return echecValidation(parsed.error);
  const { id, commentaire } = parsed.data;
  return modifierCandidature(ctx, id, () => ({ ok: true, patch: { commentaire } }));
}

/**
 * Retire une candidature de l'offre (soft-delete, avis compris). Impossible
 * après une embauche : la candidature documente l'origine de l'employé.
 */
export async function retirerCandidature(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!estUuid(id)) return { ok: false, error: MESSAGE_INTROUVABLE };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const avant = await chargerCandidature(tx, id);
    if (!avant) return { ok: false as const, message: MESSAGE_INTROUVABLE };
    if (avant.etape === 'embauche') {
      return {
        ok: false as const,
        message: 'Candidature aboutie à une embauche : elle ne peut pas être retirée.',
      };
    }
    const maintenant = new Date();
    await tx
      .update(sirhCandidatureAvis)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(and(eq(sirhCandidatureAvis.candidatureId, id), isNull(sirhCandidatureAvis.deletedAt)));
    await tx
      .update(sirhCandidatures)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhCandidatures.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_candidatures',
      rowId: id,
      before: avant,
    });
    return { ok: true as const };
  });

  if (!resultat.ok) return { ok: false, error: resultat.message };
  revaliderRecrutement(ctx);
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Avis des évaluateurs
// ─────────────────────────────────────────────────────────────

/** Ajoute l'avis de l'utilisateur courant (tout rôle ayant accès au SIRH en lecture). */
export async function ajouterAvis(
  input: AvisCandidatureInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const parsed = avisCandidatureSchema.safeParse(input);
  if (!parsed.success) return echecValidation(parsed.error);
  const data = parsed.data;

  const id = await withTenant(ctx.entreprise.id, async (tx) => {
    const candidature = await chargerCandidature(tx, data.candidatureId);
    if (!candidature) return null;
    const valeurs = {
      candidatureId: data.candidatureId,
      auteurId: ctx.utilisateur.id,
      note: data.note,
      avis: data.avis,
      commentaire: data.commentaire,
    };
    const [inserted] = await tx
      .insert(sirhCandidatureAvis)
      .values({
        entrepriseId: ctx.entreprise.id,
        ...valeurs,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: sirhCandidatureAvis.id });
    if (!inserted) throw new Error('INSERT sirh_candidature_avis échoué.');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'sirh_candidature_avis',
      rowId: inserted.id,
      after: valeurs,
    });
    return inserted.id;
  });

  if (!id) return { ok: false, error: MESSAGE_INTROUVABLE };
  revaliderRecrutement(ctx);
  return { ok: true, data: { id } };
}

/** Supprime un avis (soft-delete) : son auteur ou la gestion RH. */
export async function supprimerAvis(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!estUuid(id)) return { ok: false, error: 'Avis introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [avant] = await tx
      .select()
      .from(sirhCandidatureAvis)
      .where(and(eq(sirhCandidatureAvis.id, id), isNull(sirhCandidatureAvis.deletedAt)));
    if (!avant) return { ok: false as const, message: 'Avis introuvable.' };
    if (avant.auteurId !== ctx.utilisateur.id && !peutGererSirh(ctx.utilisateur.role)) {
      return {
        ok: false as const,
        message: 'Seul l’auteur de l’avis ou la gestion RH peut le supprimer.',
      };
    }
    await tx
      .update(sirhCandidatureAvis)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhCandidatureAvis.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_candidature_avis',
      rowId: id,
      before: avant,
    });
    return { ok: true as const };
  });

  if (!resultat.ok) return { ok: false, error: resultat.message };
  revaliderRecrutement(ctx);
  return { ok: true, data: undefined };
}
