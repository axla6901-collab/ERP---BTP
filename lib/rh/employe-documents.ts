'use server';

import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { employeDocuments, type EmployeDocument } from '@/db/schema/employes';
import { getDownloadUrl, getUploadUrl } from '@/lib/storage/s3';
import {
  documentSchema,
  type DocumentInput,
} from '@/lib/validation/rh';

import { ROLES_RH_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function listerDocuments(employeId: string): Promise<EmployeDocument[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(employeDocuments)
      .where(and(eq(employeDocuments.employeId, employeId), isNull(employeDocuments.deletedAt)))
      .orderBy(desc(employeDocuments.createdAt)),
  );
}

/**
 * Étape 1 : demande une URL d'upload MinIO presignée pour un nouveau document.
 * L'UI fait ensuite un PUT direct vers cette URL, puis appelle `enregistrerDocument`.
 */
export async function preparerUploadDocument(
  employeId: string,
  contentType: string,
  filename: string,
  tailleBytes: number,
): Promise<
  | { ok: true; data: { uploadUrl: string; minioKey: string } }
  | { ok: false; error: string }
> {
  await requireTenantContextWithMfa(ROLES_RH_WRITE);
  if (!contentType || contentType.length > 200) {
    return { ok: false, error: 'Content-Type invalide.' };
  }
  if (!Number.isFinite(tailleBytes) || tailleBytes <= 0) {
    return { ok: false, error: 'Taille de fichier invalide.' };
  }
  if (tailleBytes > MAX_SIZE_BYTES) {
    return {
      ok: false,
      error: `Fichier trop volumineux (max ${Math.round(MAX_SIZE_BYTES / 1024 / 1024)} Mo).`,
    };
  }
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100);
  const minioKey = `employes/${employeId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
  try {
    const uploadUrl = await getUploadUrl(minioKey, contentType);
    return { ok: true, data: { uploadUrl, minioKey } };
  } catch (err) {
    return {
      ok: false,
      error: 'Préparation upload impossible : ' + (err instanceof Error ? err.message : 'erreur'),
    };
  }
}

/**
 * Étape 2 : après le PUT direct vers MinIO, enregistre les métadonnées en DB.
 */
export async function enregistrerDocument(
  employeId: string,
  input: DocumentInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Métadonnées invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(employeDocuments)
        .values({
          entrepriseId: ctx.entreprise.id,
          employeId,
          type: parsed.data.type,
          libelle: parsed.data.libelle,
          minioKey: parsed.data.minioKey,
          mimeType: parsed.data.mimeType,
          tailleBytes: parsed.data.tailleBytes,
          dateValidite: parsed.data.dateValidite,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: employeDocuments.id });
      if (!inserted) throw new Error('INSERT failed');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'employe_documents',
        rowId: inserted.id,
        after: { employeId, ...parsed.data },
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes/${employeId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    throw err;
  }
}

export async function urlTelechargementDocument(
  id: string,
): Promise<{ ok: true; url: string; libelle: string } | { ok: false; error: string }> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(employeDocuments)
      .where(and(eq(employeDocuments.id, id), isNull(employeDocuments.deletedAt))),
  );
  if (!row) return { ok: false, error: 'Document introuvable.' };
  try {
    const url = await getDownloadUrl(row.minioKey);
    return { ok: true, url, libelle: row.libelle };
  } catch (err) {
    return {
      ok: false,
      error: 'Téléchargement impossible : ' + (err instanceof Error ? err.message : 'erreur'),
    };
  }
}

export async function supprimerDocument(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(employeDocuments)
      .where(and(eq(employeDocuments.id, id), isNull(employeDocuments.deletedAt)));
    if (!before) return;
    await tx
      .update(employeDocuments)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(employeDocuments.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'employe_documents',
      rowId: id,
      before,
    });
    revalidatePath(`/${ctx.entreprise.slug}/rh/employes/${before.employeId}`);
  });
  return { ok: true, data: undefined };
}
