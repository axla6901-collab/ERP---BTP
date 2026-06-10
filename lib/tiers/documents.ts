'use server';

import { randomUUID } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { documentsTiers, type DocumentTier } from '@/db/schema/tiers';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { getDownloadUrl, getUploadUrl } from '@/lib/storage/s3';
import { documentTierSchema, type DocumentTierInput } from '@/lib/validation/tiers';

import { ROLES_TIERS_WRITE } from './permissions';
import type { ActionResult } from './types';

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 Mo

/** Propriétaire d'un document : l'un des deux types de tiers gérés. */
export type ProprietaireDocument =
  | { type: 'sous_traitant'; id: string }
  | { type: 'fournisseur'; id: string };

const SEGMENT_PAR_TYPE = {
  sous_traitant: 'sous-traitants',
  fournisseur: 'fournisseurs',
} as const;

function colonneProprietaire(p: ProprietaireDocument) {
  return p.type === 'sous_traitant'
    ? documentsTiers.sousTraitantId
    : documentsTiers.fournisseurId;
}

/** Recharge l'UI de la fiche du tiers propriétaire après mutation. */
function revaliderFiche(slug: string, type: ProprietaireDocument['type'], id: string) {
  revalidatePath(`/${slug}/tiers/${SEGMENT_PAR_TYPE[type]}/${id}`);
}

export async function listerDocumentsTier(
  proprietaire: ProprietaireDocument,
): Promise<DocumentTier[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(documentsTiers)
      .where(
        and(
          eq(colonneProprietaire(proprietaire), proprietaire.id),
          isNull(documentsTiers.deletedAt),
        ),
      )
      .orderBy(desc(documentsTiers.createdAt)),
  );
}

/**
 * Étape 1 : demande une URL d'upload MinIO presignée. L'UI fait ensuite un PUT
 * direct vers cette URL, puis appelle `enregistrerDocumentTier`.
 */
export async function preparerUploadDocumentTier(
  proprietaire: ProprietaireDocument,
  contentType: string,
  filename: string,
  tailleBytes: number,
): Promise<
  | { ok: true; data: { uploadUrl: string; minioKey: string } }
  | { ok: false; error: string }
> {
  await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
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
  const minioKey = `tiers/${SEGMENT_PAR_TYPE[proprietaire.type]}/${proprietaire.id}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
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
export async function enregistrerDocumentTier(
  proprietaire: ProprietaireDocument,
  input: DocumentTierInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  const parsed = documentTierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Métadonnées invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const id = await withTenant(ctx.entreprise.id, async (tx) => {
    const [inserted] = await tx
      .insert(documentsTiers)
      .values({
        entrepriseId: ctx.entreprise.id,
        sousTraitantId: proprietaire.type === 'sous_traitant' ? proprietaire.id : null,
        fournisseurId: proprietaire.type === 'fournisseur' ? proprietaire.id : null,
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
      .returning({ id: documentsTiers.id });
    if (!inserted) throw new Error('INSERT failed');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'documents_tiers',
      rowId: inserted.id,
      after: { proprietaire, ...parsed.data },
    });
    return inserted.id;
  });
  revaliderFiche(ctx.entreprise.slug, proprietaire.type, proprietaire.id);
  return { ok: true, data: { id } };
}

export async function urlTelechargementDocumentTier(
  id: string,
): Promise<{ ok: true; url: string; libelle: string } | { ok: false; error: string }> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(documentsTiers)
      .where(and(eq(documentsTiers.id, id), isNull(documentsTiers.deletedAt))),
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

export async function supprimerDocumentTier(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  const proprietaire = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(documentsTiers)
      .where(and(eq(documentsTiers.id, id), isNull(documentsTiers.deletedAt)));
    if (!before) return null;
    await tx
      .update(documentsTiers)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(documentsTiers.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'documents_tiers',
      rowId: id,
      before,
    });
    return before.sousTraitantId
      ? ({ type: 'sous_traitant', id: before.sousTraitantId } as const)
      : before.fournisseurId
        ? ({ type: 'fournisseur', id: before.fournisseurId } as const)
        : null;
  });
  if (proprietaire) revaliderFiche(ctx.entreprise.slug, proprietaire.type, proprietaire.id);
  return { ok: true, data: undefined };
}
