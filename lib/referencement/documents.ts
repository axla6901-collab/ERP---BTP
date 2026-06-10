'use server';

import { randomUUID } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { naturesDocument } from '@/db/schema/referentiel-tiers';
import { tierDocuments } from '@/db/schema/tiers-registre';
import { getDownloadUrl, getUploadUrl } from '@/lib/storage/s3';
import {
  refusDocumentSchema,
  tierDocumentSchema,
  type RefusDocumentInput,
  type TierDocumentInput,
} from '@/lib/validation/referencement-tiers';

import { peutEcrireDocumentsTiers } from './permissions';

const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 Mo

function ajoutJoursISO(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Étape 1 : URL d'upload MinIO presignée. L'UI fait ensuite un PUT direct, puis
 * appelle `enregistrerDocumentTier`.
 */
export async function preparerUploadDocumentTier(
  tierId: string,
  contentType: string,
  filename: string,
  tailleBytes: number,
): Promise<
  { ok: true; data: { uploadUrl: string; minioKey: string } } | { ok: false; error: string }
> {
  await requireTenantContextWithMfa();
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
  const minioKey = `tiers/${tierId}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`;
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
 * Étape 2 : enregistre les métadonnées après le PUT MinIO. Calcule
 * `date_fin_validite` selon le mode de contrôle de la nature de document.
 */
export async function enregistrerDocumentTier(
  tierId: string,
  input: TierDocumentInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = tierDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Métadonnées invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutEcrireDocumentsTiers(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const d = parsed.data;

  const id = await withTenant(ctx.entreprise.id, async (tx) => {
    const [nature] = await tx
      .select()
      .from(naturesDocument)
      .where(and(eq(naturesDocument.id, d.natureDocumentId), isNull(naturesDocument.deletedAt)));
    if (!nature) throw new Error('Nature de document introuvable.');

    // Calcul de la date de fin de validité selon le mode de contrôle.
    let dateFinValidite: string | null = null;
    switch (nature.modeControle) {
      case 'duree_jours':
        dateFinValidite =
          d.dateFinValidite ??
          (d.dateObtention && nature.delaiValiditeJours != null
            ? ajoutJoursISO(d.dateObtention, nature.delaiValiditeJours)
            : null);
        break;
      case 'date_fin_assurance':
        // La date d'expiration figure sur le document → saisie directe.
        dateFinValidite = d.dateFinValidite ?? null;
        break;
      case 'case_a_cocher':
      case 'date_obtention':
        dateFinValidite = null;
        break;
    }

    const [inserted] = await tx
      .insert(tierDocuments)
      .values({
        entrepriseId: ctx.entreprise.id,
        tierId,
        natureDocumentId: d.natureDocumentId,
        minioKey: d.minioKey,
        nomFichierOrigine: d.nomFichierOrigine,
        mimeType: d.mimeType,
        tailleBytes: d.tailleBytes,
        dateObtention: d.dateObtention,
        dateFinValidite,
        notes: d.notes,
        statut: 'en_attente_validation',
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: tierDocuments.id });
    if (!inserted) throw new Error('INSERT document échoué');
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'tier_documents',
      rowId: inserted.id,
      after: { tierId, ...d, dateFinValidite },
    });
    return inserted.id;
  });

  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement/${tierId}`);
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
  return { ok: true, data: { id } };
}

export async function urlTelechargementDocumentTier(
  id: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(tierDocuments)
      .where(and(eq(tierDocuments.id, id), isNull(tierDocuments.deletedAt))),
  );
  if (!row || !row.minioKey) return { ok: false, error: 'Document introuvable.' };
  try {
    const url = await getDownloadUrl(row.minioKey);
    return { ok: true, url };
  } catch (err) {
    return {
      ok: false,
      error: 'Téléchargement impossible : ' + (err instanceof Error ? err.message : 'erreur'),
    };
  }
}

export async function validerDocumentTier(id: string): Promise<ActionResult<void>> {
  const ctx = await requireTenantContextWithMfa();
  if (!peutEcrireDocumentsTiers(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(tierDocuments)
      .where(and(eq(tierDocuments.id, id), isNull(tierDocuments.deletedAt)));
    if (!before) return 'Document introuvable.';
    await tx
      .update(tierDocuments)
      .set({
        statut: 'valide',
        motifRefus: null,
        validatedAt: new Date(),
        validatedBy: ctx.utilisateur.id,
        updatedAt: new Date(),
        updatedBy: ctx.utilisateur.id,
      })
      .where(eq(tierDocuments.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'tier_documents',
      rowId: id,
      before,
      after: { ...before, statut: 'valide' },
    });
    return { tierId: before.tierId };
  });
  if (typeof res === 'string') return { ok: false, error: res };
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement/${res.tierId}`);
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
  return { ok: true, data: undefined };
}

export async function refuserDocumentTier(
  id: string,
  input: RefusDocumentInput,
): Promise<ActionResult<void>> {
  const parsed = refusDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Motif requis.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutEcrireDocumentsTiers(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(tierDocuments)
      .where(and(eq(tierDocuments.id, id), isNull(tierDocuments.deletedAt)));
    if (!before) return 'Document introuvable.';
    await tx
      .update(tierDocuments)
      .set({
        statut: 'refuse',
        motifRefus: parsed.data.motif,
        validatedAt: new Date(),
        validatedBy: ctx.utilisateur.id,
        updatedAt: new Date(),
        updatedBy: ctx.utilisateur.id,
      })
      .where(eq(tierDocuments.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'tier_documents',
      rowId: id,
      before,
      after: { ...before, statut: 'refuse', motifRefus: parsed.data.motif },
    });
    return { tierId: before.tierId };
  });
  if (typeof res === 'string') return { ok: false, error: res };
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement/${res.tierId}`);
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
  return { ok: true, data: undefined };
}

export async function supprimerDocumentTier(id: string): Promise<ActionResult<void>> {
  const ctx = await requireTenantContextWithMfa();
  if (!peutEcrireDocumentsTiers(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(tierDocuments)
      .where(and(eq(tierDocuments.id, id), isNull(tierDocuments.deletedAt)));
    if (!before) return 'Document introuvable.';
    await tx
      .update(tierDocuments)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(tierDocuments.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'tier_documents', rowId: id, before });
    return { tierId: before.tierId };
  });
  if (typeof res === 'string') return { ok: false, error: res };
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement/${res.tierId}`);
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
  return { ok: true, data: undefined };
}
