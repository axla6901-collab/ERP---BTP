'use server';

import { and, count, eq, inArray, isNull } from 'drizzle-orm';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import {
  sirhCandidats,
  sirhCandidatureAvis,
  sirhCandidatures,
  sirhDocuments,
} from '@/db/schema/test-sirh';
import { ETAPES_PIPELINE } from '@/lib/validation/test-sirh/enums';
import { candidatSchema, type CandidatInput } from '@/lib/validation/test-sirh/recrutement';

import { exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';
import {
  MESSAGE_EMAIL_CANDIDAT_DOUBLON,
  emailCandidatDejaUtilise,
  estUuid,
  revaliderRecrutement,
} from './commun-serveur';

/**
 * Server actions — Test SIRH › Recrutement › Vivier de candidats (Factorial
 * ats/Candidate). Réservées à la gestion RH (admin, RH).
 */

/** Crée (sans `id`) ou met à jour (avec `id`) un candidat. Email unique (casse ignorée). */
export async function enregistrerCandidat(
  input: CandidatInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = candidatSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const colonnes = {
    nom: data.nom,
    prenom: data.prenom,
    email: data.email,
    telephone: data.telephone,
    ville: data.ville,
    source: data.source,
    consentementRgpd: data.consentementRgpd,
    dateConsentement: data.consentementRgpd ? data.dateConsentement : null,
    notes: data.notes,
  };

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      if (data.email && (await emailCandidatDejaUtilise(tx, data.email, data.id))) {
        return { type: 'doublon' as const };
      }
      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhCandidats)
          .where(and(eq(sirhCandidats.id, data.id), isNull(sirhCandidats.deletedAt)));
        if (!before) return { type: 'introuvable' as const };
        await tx
          .update(sirhCandidats)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhCandidats.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_candidats',
          rowId: data.id,
          before,
          after: colonnes,
        });
        return { type: 'ok' as const, id: data.id };
      }
      const [inserted] = await tx
        .insert(sirhCandidats)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhCandidats.id });
      if (!inserted) throw new Error('INSERT sirh_candidats échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_candidats',
        rowId: inserted.id,
        after: colonnes,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'doublon') {
      return {
        ok: false,
        error: MESSAGE_EMAIL_CANDIDAT_DOUBLON,
        fieldErrors: { email: [MESSAGE_EMAIL_CANDIDAT_DOUBLON] },
      };
    }
    if (resultat.type === 'introuvable') return { ok: false, error: 'Candidat introuvable.' };
    revaliderRecrutement(ctx);
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, { unicite: MESSAGE_EMAIL_CANDIDAT_DOUBLON });
    if (message) {
      return { ok: false, error: message, fieldErrors: { email: [message] } };
    }
    throw err;
  }
}

/**
 * Suppression (soft-delete) d'un candidat — purge RGPD comprise. Refusée tant
 * qu'il a des candidatures en cours (à clôturer d'abord). Ses candidatures,
 * avis et pièces (CV) sont supprimés avec lui : ce sont des enfants « cascade »
 * (le soft-delete ne déclenche pas les `ON DELETE CASCADE`, on les marque donc
 * explicitement).
 */
export async function supprimerCandidat(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!estUuid(id)) return { ok: false, error: 'Candidat introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhCandidats)
      .where(and(eq(sirhCandidats.id, id), isNull(sirhCandidats.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const [enCours] = await tx
      .select({ n: count() })
      .from(sirhCandidatures)
      .where(
        and(
          eq(sirhCandidatures.candidatId, id),
          isNull(sirhCandidatures.deletedAt),
          inArray(sirhCandidatures.etape, [...ETAPES_PIPELINE]),
        ),
      );
    const n = enCours?.n ?? 0;
    if (n > 0) {
      return {
        type: 'bloque' as const,
        message:
          `Suppression impossible : ce candidat a ${n} candidature${n > 1 ? 's' : ''} en cours. ` +
          'Clôturez-les (refus ou désistement) avant de le supprimer.',
      };
    }

    const maintenant = new Date();
    const candidatures = await tx
      .select()
      .from(sirhCandidatures)
      .where(and(eq(sirhCandidatures.candidatId, id), isNull(sirhCandidatures.deletedAt)));
    const idsCandidatures = candidatures.map((c) => c.id);
    if (idsCandidatures.length > 0) {
      await tx
        .update(sirhCandidatureAvis)
        .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
        .where(
          and(
            inArray(sirhCandidatureAvis.candidatureId, idsCandidatures),
            isNull(sirhCandidatureAvis.deletedAt),
          ),
        );
      await tx
        .update(sirhCandidatures)
        .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
        .where(inArray(sirhCandidatures.id, idsCandidatures));
      for (const c of candidatures) {
        await auditLogIn(tx, {
          action: 'delete',
          tableName: 'sirh_candidatures',
          rowId: c.id,
          before: c,
        });
      }
    }

    const documents = await tx
      .select()
      .from(sirhDocuments)
      .where(and(eq(sirhDocuments.candidatId, id), isNull(sirhDocuments.deletedAt)));
    if (documents.length > 0) {
      await tx
        .update(sirhDocuments)
        .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
        .where(
          inArray(
            sirhDocuments.id,
            documents.map((d) => d.id),
          ),
        );
      for (const d of documents) {
        await auditLogIn(tx, {
          action: 'delete',
          tableName: 'sirh_documents',
          rowId: d.id,
          before: d,
        });
      }
    }

    await tx
      .update(sirhCandidats)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhCandidats.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_candidats', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Candidat introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revaliderRecrutement(ctx);
  return { ok: true, data: undefined };
}
