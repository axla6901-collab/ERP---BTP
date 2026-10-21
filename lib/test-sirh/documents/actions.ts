'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhDocuments, sirhDossiersDocuments } from '@/db/schema/test-sirh';
import {
  documentMetadonneesSchema,
  dossierDocumentsSchema,
  type DocumentMetadonneesInput,
  type DossierDocumentsInput,
} from '@/lib/validation/test-sirh/documents';

import { employeIdDeLUtilisateur } from '../acces';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { peutGererSirh, ROLES_SIRH_GESTION } from '../permissions';
import { messageBlocageSuppressionDossier } from './regles';

/**
 * Server actions — Test SIRH › Documents RH (GED, Factorial documents).
 *
 * Le dépôt, le téléchargement et la suppression des FICHIERS passent par
 * `lib/test-sirh/stockage.ts` (`preparerUploadSirh`, `creerDocumentSirh`,
 * `urlTelechargementDocumentSirh`, `supprimerDocumentSirh`). Ce module gère les
 * dossiers et les métadonnées des documents déjà déposés.
 */

// ─────────────────────────────────────────────────────────────
// Dossiers
// ─────────────────────────────────────────────────────────────

/** Crée (sans `id`) ou met à jour (avec `id`) un dossier de la GED. */
export async function enregistrerDossierDocuments(
  input: DossierDocumentsInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = dossierDocumentsSchema.safeParse(input);
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
    description: data.description,
    visibleSalarie: data.visibleSalarie,
    ordre: data.ordre,
  };

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhDossiersDocuments)
          .where(
            and(eq(sirhDossiersDocuments.id, data.id), isNull(sirhDossiersDocuments.deletedAt)),
          );
        if (!before) return null;
        await tx
          .update(sirhDossiersDocuments)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhDossiersDocuments.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_dossiers_documents',
          rowId: data.id,
          before,
          after: colonnes,
        });
        return data.id;
      }
      const [inserted] = await tx
        .insert(sirhDossiersDocuments)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhDossiersDocuments.id });
      if (!inserted) throw new Error('INSERT sirh_dossiers_documents échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_dossiers_documents',
        rowId: inserted.id,
        after: colonnes,
      });
      return inserted.id;
    });
    if (!id) return { ok: false, error: 'Dossier introuvable.' };
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: { id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un dossier porte déjà ce nom.',
    });
    if (message) {
      return { ok: false, error: message, fieldErrors: { nom: [message] } };
    }
    throw err;
  }
}

/** Suppression (soft-delete) d'un dossier — refusée s'il contient encore des documents. */
export async function supprimerDossierDocuments(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Dossier invalide.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhDossiersDocuments)
      .where(and(eq(sirhDossiersDocuments.id, id), isNull(sirhDossiersDocuments.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const [ref] = await tx
      .select({ n: count() })
      .from(sirhDocuments)
      .where(and(eq(sirhDocuments.dossierId, id), isNull(sirhDocuments.deletedAt)));
    const blocage = messageBlocageSuppressionDossier(ref?.n ?? 0);
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(sirhDossiersDocuments)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhDossiersDocuments.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_dossiers_documents',
      rowId: id,
      before,
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Dossier introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────

/** Modifie les métadonnées d'un document (titre, dossier, dates, visibilité, signature). */
export async function modifierDocumentSirh(
  input: DocumentMetadonneesInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = documentMetadonneesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const colonnes = {
    titre: data.titre,
    dossierId: data.dossierId,
    dateDocument: data.dateDocument,
    dateExpiration: data.dateExpiration,
    visibleSalarie: data.visibleSalarie,
    signatureRequise: data.signatureRequise,
    notes: data.notes,
  };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhDocuments)
      .where(and(eq(sirhDocuments.id, data.id), isNull(sirhDocuments.deletedAt)));
    if (!before) return 'introuvable' as const;
    if (data.dossierId) {
      const [dossier] = await tx
        .select({ id: sirhDossiersDocuments.id })
        .from(sirhDossiersDocuments)
        .where(
          and(
            eq(sirhDossiersDocuments.id, data.dossierId),
            isNull(sirhDossiersDocuments.deletedAt),
          ),
        );
      if (!dossier) return 'dossier' as const;
    }
    await tx
      .update(sirhDocuments)
      .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhDocuments.id, data.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_documents',
      rowId: data.id,
      before,
      after: colonnes,
    });
    return 'ok' as const;
  });

  if (resultat === 'introuvable') return { ok: false, error: 'Document introuvable.' };
  if (resultat === 'dossier') {
    return {
      ok: false,
      error: 'Dossier introuvable.',
      fieldErrors: { dossierId: ['Dossier introuvable.'] },
    };
  }
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: { id: data.id } };
}

/**
 * « Marquer signé » un document à signature (date-heure courante) : gestion RH,
 * ou le salarié concerné pour un document qui lui est visible (accusé de
 * signature depuis Mon espace).
 */
export async function marquerDocumentSigne(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Document invalide.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhDocuments)
      .where(and(eq(sirhDocuments.id, id), isNull(sirhDocuments.deletedAt)));
    if (!before) return 'introuvable' as const;
    if (!before.signatureRequise) return 'non_requise' as const;
    if (before.signeLe) return 'deja' as const;

    if (!peutGererSirh(ctx.utilisateur.role)) {
      const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
      const autorise =
        moi !== null &&
        before.employeId === moi &&
        (before.visibleSalarie || before.createdBy === ctx.utilisateur.id);
      if (!autorise) return 'refuse' as const;
    }

    const signeLe = new Date();
    await tx
      .update(sirhDocuments)
      .set({ signeLe, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhDocuments.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_documents',
      rowId: id,
      before,
      after: { signeLe },
    });
    return 'ok' as const;
  });

  if (resultat === 'introuvable') return { ok: false, error: 'Document introuvable.' };
  if (resultat === 'non_requise') {
    return { ok: false, error: 'Ce document ne requiert pas de signature.' };
  }
  if (resultat === 'deja') return { ok: false, error: 'Ce document est déjà signé.' };
  if (resultat === 'refuse') return { ok: false, error: 'Accès refusé.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}
