'use server';

import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { getDownloadUrl, getUploadUrl } from '@/lib/storage/s3';
import { flotteDocuments, flotteVehicules, type FlotteDocument } from '@/db/schema/flotte';
import { documentVehiculeSchema, type DocumentVehiculeInput } from '@/lib/validation/flotte';

import { ROLES_FLOTTE_WRITE } from './permissions';

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 Mo

export async function listerDocumentsVehicule(vehiculeId: string): Promise<FlotteDocument[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(flotteDocuments)
      .where(and(eq(flotteDocuments.vehiculeId, vehiculeId), isNull(flotteDocuments.deletedAt)))
      .orderBy(desc(flotteDocuments.createdAt)),
  );
}

/**
 * Étape 1 : URL d'upload MinIO présignée. L'UI fait ensuite un PUT direct vers
 * cette URL, puis appelle `enregistrerDocumentVehicule`.
 */
export async function preparerUploadDocumentVehicule(
  vehiculeId: string,
  contentType: string,
  filename: string,
  tailleBytes: number,
): Promise<
  { ok: true; data: { uploadUrl: string; minioKey: string } } | { ok: false; error: string }
> {
  await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
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
  const minioKey = `flotte/vehicules/${vehiculeId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
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

/** Étape 2 : après le PUT vers MinIO, enregistre les métadonnées en base. */
export async function enregistrerDocumentVehicule(
  vehiculeId: string,
  input: DocumentVehiculeInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const parsed = documentVehiculeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Métadonnées invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [vehicule] = await tx
      .select({ id: flotteVehicules.id })
      .from(flotteVehicules)
      .where(and(eq(flotteVehicules.id, vehiculeId), isNull(flotteVehicules.deletedAt)));
    if (!vehicule) return null;

    const [inserted] = await tx
      .insert(flotteDocuments)
      .values({
        entrepriseId: ctx.entreprise.id,
        vehiculeId,
        typeDocument: parsed.data.typeDocument,
        libelle: parsed.data.libelle,
        minioKey: parsed.data.minioKey,
        mimeType: parsed.data.mimeType,
        tailleBytes: parsed.data.tailleBytes ?? null,
        dateValidite: parsed.data.dateValidite,
        notes: parsed.data.notes,
        echeanceId: parsed.data.echeanceId,
        entretienId: parsed.data.entretienId,
        sinistreId: parsed.data.sinistreId,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: flotteDocuments.id });
    if (!inserted) throw new Error('INSERT flotte_documents échoué.');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'flotte_documents',
      rowId: inserted.id,
      after: { vehiculeId, ...parsed.data },
    });
    return inserted.id;
  });

  if (!resultat) return { ok: false, error: 'Véhicule introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${vehiculeId}`);
  return { ok: true, data: { id: resultat } };
}

export async function urlTelechargementDocumentVehicule(
  id: string,
): Promise<{ ok: true; url: string; libelle: string } | { ok: false; error: string }> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(flotteDocuments)
      .where(and(eq(flotteDocuments.id, id), isNull(flotteDocuments.deletedAt))),
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

export async function supprimerDocumentVehicule(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  const vehiculeId = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(flotteDocuments)
      .where(and(eq(flotteDocuments.id, id), isNull(flotteDocuments.deletedAt)));
    if (!before) return null;
    await tx
      .update(flotteDocuments)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(flotteDocuments.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'flotte_documents',
      rowId: id,
      before,
    });
    return before.vehiculeId;
  });

  if (!vehiculeId) return { ok: false, error: 'Document introuvable.' };
  revalidatePath(`/${ctx.entreprise.slug}/flotte/vehicules/${vehiculeId}`);
  return { ok: true, data: undefined };
}
