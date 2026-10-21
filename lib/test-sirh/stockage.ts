'use server';

import { randomUUID } from 'node:crypto';

import { and, eq, isNull, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { getDownloadUrl, getUploadUrl } from '@/lib/storage/s3';
import {
  sirhAbsences,
  sirhCandidats,
  sirhDocuments,
  sirhDossiersDocuments,
  sirhNotesFrais,
} from '@/db/schema/test-sirh';
import {
  dateOptionnelle,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
} from '@/lib/validation/test-sirh/commun';

import { employeIdDeLUtilisateur, peutAgirPourEmploye } from './acces';
import { baseSirh, exigerContexteSirhAction } from './contexte';
import { peutGererSirh, peutLireSirh, peutValiderSirh, peutVoirPaieSirh } from './permissions';

/**
 * Stockage des fichiers du module Test SIRH (MinIO, URL présignées) — partagé
 * par la GED RH, les justificatifs d'absence / de note de frais et les CV.
 *
 * Flux en 2 étapes (identique au module Flotte) :
 *   1. `preparerUploadSirh` → URL PUT présignée + clé MinIO préfixée par le tenant ;
 *   2. PUT direct du navigateur vers MinIO, puis `creerDocumentSirh` (métadonnées).
 *
 * Accès : un gestionnaire RH (admin/RH) agit pour tous ; un salarié uniquement
 * pour sa propre fiche (justificatifs) — cf. `peutAgirPourEmploye`.
 */

const TAILLE_MAX_OCTETS = 25 * 1024 * 1024; // 25 Mo

export type CibleDocumentSirh =
  | { type: 'employe'; id: string }
  | { type: 'candidat'; id: string }
  | { type: 'entreprise' };

const cibleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('employe'), id: z.string().uuid() }),
  z.object({ type: z.literal('candidat'), id: z.string().uuid() }),
  z.object({ type: z.literal('entreprise') }),
]);

/** Préfixe MinIO des fichiers SIRH d'une entreprise (contrôlé à l'enregistrement). */
function prefixeTenant(entrepriseId: string): string {
  return `test-sirh/${entrepriseId}/`;
}

export async function preparerUploadSirh(
  cible: CibleDocumentSirh,
  contentType: string,
  filename: string,
  tailleBytes: number,
): Promise<
  { ok: true; data: { uploadUrl: string; minioKey: string } } | { ok: false; error: string }
> {
  const ctx = await exigerContexteSirhAction();
  const parsedCible = cibleSchema.safeParse(cible);
  if (!parsedCible.success) return { ok: false, error: 'Cible du document invalide.' };
  if (!contentType || contentType.length > 200) {
    return { ok: false, error: 'Type de fichier invalide.' };
  }
  if (!Number.isFinite(tailleBytes) || tailleBytes <= 0) {
    return { ok: false, error: 'Taille de fichier invalide.' };
  }
  if (tailleBytes > TAILLE_MAX_OCTETS) {
    return { ok: false, error: 'Fichier trop volumineux (max 25 Mo).' };
  }

  const c = parsedCible.data;
  const autorise = await withTenant(ctx.entreprise.id, async (tx) => {
    if (c.type === 'employe') return peutAgirPourEmploye(tx, ctx, c.id);
    return peutGererSirh(ctx.utilisateur.role);
  });
  if (!autorise) return { ok: false, error: 'Accès refusé.' };

  const nomSur = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'fichier';
  const dossier = c.type === 'entreprise' ? 'entreprise' : `${c.type}s/${c.id}`;
  const minioKey = `${prefixeTenant(ctx.entreprise.id)}${dossier}/${Date.now()}-${randomUUID().slice(0, 8)}-${nomSur}`;
  try {
    const uploadUrl = await getUploadUrl(minioKey, contentType);
    return { ok: true, data: { uploadUrl, minioKey } };
  } catch (err) {
    return {
      ok: false,
      error:
        'Préparation du téléversement impossible : ' +
        (err instanceof Error ? err.message : 'erreur'),
    };
  }
}

const documentSirhSchema = z.object({
  cible: cibleSchema,
  titre: texteRequis('Titre', 200),
  minioKey: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(200),
  tailleBytes: z.number().int().positive().max(TAILLE_MAX_OCTETS).nullable(),
  dossierId: uuidOptionnel,
  dateDocument: dateOptionnelle,
  dateExpiration: dateOptionnelle,
  visibleSalarie: z.boolean().default(false),
  signatureRequise: z.boolean().default(false),
  notes: texteOptionnel(1000),
});
export type DocumentSirhInput = z.input<typeof documentSirhSchema>;

/** Étape 2 : enregistre les métadonnées d'un fichier déjà déposé dans MinIO. */
export async function creerDocumentSirh(
  input: DocumentSirhInput,
): Promise<ActionResult<{ id: string; titre: string }>> {
  const ctx = await exigerContexteSirhAction();
  const parsed = documentSirhSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Métadonnées du document invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  if (!data.minioKey.startsWith(prefixeTenant(ctx.entreprise.id))) {
    return { ok: false, error: 'Clé de stockage invalide.' };
  }
  const gestionnaire = peutGererSirh(ctx.utilisateur.role);

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const c = data.cible;
    if (c.type === 'employe') {
      if (!(await peutAgirPourEmploye(tx, ctx, c.id))) return { type: 'refuse' as const };
    } else if (!gestionnaire) {
      return { type: 'refuse' as const };
    }
    if (c.type === 'candidat') {
      const [cand] = await tx
        .select({ id: sirhCandidats.id })
        .from(sirhCandidats)
        .where(and(eq(sirhCandidats.id, c.id), isNull(sirhCandidats.deletedAt)));
      if (!cand) return { type: 'introuvable' as const };
    }
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
      if (!dossier) return { type: 'introuvable' as const };
    }

    const [inserted] = await tx
      .insert(sirhDocuments)
      .values({
        entrepriseId: ctx.entreprise.id,
        dossierId: data.dossierId,
        employeId: c.type === 'employe' ? c.id : null,
        candidatId: c.type === 'candidat' ? c.id : null,
        titre: data.titre,
        minioKey: data.minioKey,
        mimeType: data.mimeType,
        tailleBytes: data.tailleBytes,
        dateDocument: data.dateDocument,
        dateExpiration: data.dateExpiration,
        // Un salarié qui dépose sa propre pièce doit pouvoir la revoir.
        visibleSalarie: gestionnaire ? data.visibleSalarie : true,
        signatureRequise: gestionnaire ? data.signatureRequise : false,
        notes: data.notes,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: sirhDocuments.id });
    if (!inserted) throw new Error('INSERT sirh_documents échoué.');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'sirh_documents',
      rowId: inserted.id,
      after: data,
    });
    return { type: 'ok' as const, id: inserted.id };
  });

  if (resultat.type === 'refuse') return { ok: false, error: 'Accès refusé.' };
  if (resultat.type === 'introuvable') {
    return { ok: false, error: 'Candidat ou dossier introuvable.' };
  }
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: { id: resultat.id, titre: data.titre } };
}

/**
 * URL de téléchargement présignée, après contrôle d'accès :
 * - gestion RH / paie : tous les documents ;
 * - valideurs : justificatifs rattachés à une absence ou une note de frais ;
 * - salarié : ses documents visibles (ou déposés par lui) et les documents
 *   d'entreprise marqués visibles.
 */
export async function urlTelechargementDocumentSirh(
  id: string,
): Promise<{ ok: true; url: string; titre: string } | { ok: false; error: string }> {
  const ctx = await exigerContexteSirhAction();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Document invalide.' };

  const doc = await withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(sirhDocuments)
      .where(and(eq(sirhDocuments.id, id), isNull(sirhDocuments.deletedAt)));
    if (!row) return null;

    const role = ctx.utilisateur.role;
    if (peutGererSirh(role) || peutVoirPaieSirh(role)) return row;
    // CV et pièces de candidature : consultables par les évaluateurs (rôles de lecture).
    if (row.candidatId !== null && peutLireSirh(role)) return row;

    if (peutValiderSirh(role)) {
      const [absence] = await tx
        .select({ id: sirhAbsences.id })
        .from(sirhAbsences)
        .where(eq(sirhAbsences.justificatifDocumentId, id))
        .limit(1);
      const [frais] = await tx
        .select({ id: sirhNotesFrais.id })
        .from(sirhNotesFrais)
        .where(eq(sirhNotesFrais.justificatifDocumentId, id))
        .limit(1);
      if (absence || frais) return row;
    }

    if (row.employeId === null && row.candidatId === null && row.visibleSalarie) return row;

    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (
      moi &&
      row.employeId === moi &&
      (row.visibleSalarie || row.createdBy === ctx.utilisateur.id)
    ) {
      return row;
    }
    return 'refuse' as const;
  });

  if (doc === null) return { ok: false, error: 'Document introuvable.' };
  if (doc === 'refuse') return { ok: false, error: 'Accès refusé.' };
  try {
    const url = await getDownloadUrl(doc.minioKey);
    return { ok: true, url, titre: doc.titre };
  } catch (err) {
    return {
      ok: false,
      error: 'Téléchargement impossible : ' + (err instanceof Error ? err.message : 'erreur'),
    };
  }
}

/** Suppression (soft-delete) — réservée à la gestion RH. Les liens justificatifs passent à NULL. */
export async function supprimerDocumentSirh(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction();
  if (!peutGererSirh(ctx.utilisateur.role)) return { ok: false, error: 'Accès refusé.' };
  const supprime = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhDocuments)
      .where(and(eq(sirhDocuments.id, id), isNull(sirhDocuments.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhDocuments)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhDocuments.id, id));
    // Le soft-delete ne déclenche pas le ON DELETE SET NULL : on détache explicitement.
    await tx
      .update(sirhAbsences)
      .set({ justificatifDocumentId: null })
      .where(eq(sirhAbsences.justificatifDocumentId, id));
    await tx
      .update(sirhNotesFrais)
      .set({ justificatifDocumentId: null })
      .where(eq(sirhNotesFrais.justificatifDocumentId, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_documents', rowId: id, before });
    return true;
  });
  if (!supprime) return { ok: false, error: 'Document introuvable.' };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/** Documents rattachés à un employé, filtrés selon les droits de l'appelant (dossier collaborateur / Mon espace). */
export async function listerDocumentsEmployeSirh(employeId: string): Promise<
  Array<{
    id: string;
    titre: string;
    dossierId: string | null;
    mimeType: string;
    tailleBytes: number | null;
    dateDocument: string | null;
    dateExpiration: string | null;
    visibleSalarie: boolean;
    signatureRequise: boolean;
    signeLe: string | null;
    createdAt: string;
  }>
> {
  const ctx = await exigerContexteSirhAction();
  if (!z.string().uuid().safeParse(employeId).success) return [];
  return withTenant(ctx.entreprise.id, async (tx) => {
    const role = ctx.utilisateur.role;
    const toutVoir = peutGererSirh(role) || peutVoirPaieSirh(role);
    if (!toutVoir) {
      const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
      if (moi !== employeId) return [];
    }
    const rows = await tx
      .select()
      .from(sirhDocuments)
      .where(
        and(
          eq(sirhDocuments.employeId, employeId),
          isNull(sirhDocuments.deletedAt),
          toutVoir
            ? undefined
            : or(
                eq(sirhDocuments.visibleSalarie, true),
                eq(sirhDocuments.createdBy, ctx.utilisateur.id),
              ),
        ),
      )
      .orderBy(sirhDocuments.createdAt);
    return rows.reverse().map((d) => ({
      id: d.id,
      titre: d.titre,
      dossierId: d.dossierId,
      mimeType: d.mimeType,
      tailleBytes: d.tailleBytes,
      dateDocument: d.dateDocument,
      dateExpiration: d.dateExpiration,
      visibleSalarie: d.visibleSalarie,
      signatureRequise: d.signatureRequise,
      signeLe: d.signeLe ? d.signeLe.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
    }));
  });
}
