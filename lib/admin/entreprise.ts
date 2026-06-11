'use server';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { peutAdministrer, ROLES_ADMINISTRATION } from '@/lib/admin/permissions';
import { sanitizeConditionsHtml } from '@/lib/admin/sanitize-html';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa, type TenantContext } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { entrepriseConditions, entrepriseLogos, entreprises } from '@/db/schema/entreprises';
import {
  conditionNouvelleVersionSchema,
  entrepriseIdentiteSchema,
  logoRenommerSchema,
  logoReorderSchema,
  logoTypeSchema,
  logoUploadMetaSchema,
  LOGO_MIME_AUTORISES,
  LOGO_TAILLE_MAX_OCTETS,
  type ConditionNouvelleVersionInput,
  type ConditionType,
  type EntrepriseIdentiteInput,
  type LogoRenommerInput,
  type LogoReorderInput,
  type LogoType,
} from '@/lib/validation/entreprise';
import { deleteObject, putObject } from '@/lib/storage/s3';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Garde des server actions du module Administration > Société.
 *
 * Note multi-tenant : la table `entreprises` (racine du tenant) est globale
 * (pas de policy RLS), mais on passe quand même par `withTenant(ctx.entreprise.id, ...)`
 * pour poser la GUC `app.current_entreprise_id` que lit `auditLogIn` — sinon
 * l'INSERT dans `audit_log` casse avec `invalid input syntax for type uuid: ""`.
 * Les tables filles `entreprise_logos` et `entreprise_conditions` sont en plus
 * RLS-scopées, et la GUC sert aussi à les filtrer.
 */
async function requireAdmin(): Promise<TenantContext> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  if (!peutAdministrer(ctx.utilisateur.role)) {
    throw new Error('Accès refusé : section Administration réservée aux administrateurs.');
  }
  return ctx;
}

function pathsToRevalidate(entrepriseSlug: string) {
  revalidatePath(`/${entrepriseSlug}/administration/entreprise`);
  revalidatePath(`/${entrepriseSlug}/administration`);
}

// ─────────────────────────────────────────────────────────────
// Identité
// ─────────────────────────────────────────────────────────────

export async function mettreAJourIdentiteEntreprise(
  input: EntrepriseIdentiteInput,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const entrepriseId = ctx.entreprise.id;
  const entrepriseSlug = ctx.entreprise.slug;
  const parsed = entrepriseIdentiteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // withTenant (et non db.transaction direct) : `entreprises` n'a pas de policy
  // RLS (c'est la racine du tenant), mais `auditLogIn` lit la GUC
  // `app.current_entreprise_id` pour remplir audit_log.entreprise_id — sans la
  // poser, l'INSERT casse avec `invalid input syntax for type uuid: ""`.
  await withTenant(entrepriseId, async (tx) => {
    const [before] = await tx
      .select()
      .from(entreprises)
      .where(eq(entreprises.id, entrepriseId))
      .limit(1);
    if (!before) throw new Error('Entreprise introuvable.');

    await tx
      .update(entreprises)
      .set({
        raisonSociale: parsed.data.raisonSociale,
        siret: parsed.data.siret,
        tvaIntracom: parsed.data.tvaIntracom,
        adresseLigne1: parsed.data.adresseLigne1,
        adresseLigne2: parsed.data.adresseLigne2,
        codePostal: parsed.data.codePostal,
        ville: parsed.data.ville,
        pays: parsed.data.pays,
        iban: parsed.data.iban,
        bic: parsed.data.bic,
        rcs: parsed.data.rcs,
        formeJuridique: parsed.data.formeJuridique,
        capitalSocial: parsed.data.capitalSocial,
        codeApe: parsed.data.codeApe,
        updatedAt: new Date(),
      })
      .where(eq(entreprises.id, entrepriseId));

    await auditLogIn(tx, {
      action: 'update',
      tableName: 'entreprises',
      rowId: entrepriseId,
      before,
      after: parsed.data,
    });
  });

  pathsToRevalidate(entrepriseSlug);
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Logos
// ─────────────────────────────────────────────────────────────

function genererStorageKey(entrepriseId: string, mime: string): string {
  const extension =
    mime === 'image/png'
      ? 'png'
      : mime === 'image/jpeg'
        ? 'jpg'
        : mime === 'image/webp'
          ? 'webp'
          : 'svg';
  const aleatoire = crypto.randomUUID();
  return `entreprises/${entrepriseId}/logos/${aleatoire}.${extension}`;
}

/**
 * Upload d'un logo (FormData multipart). Accept : PNG/JPEG/WebP/SVG ≤ 5 Mo.
 * Pour `type='principal'`, remplace le logo principal existant (soft-delete +
 * suppression de l'objet S3 sortant).
 */
export async function uploadLogo(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdmin();
  const utilisateur = ctx.utilisateur;
  const entrepriseId = ctx.entreprise.id;
  const entrepriseSlug = ctx.entreprise.slug;

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'Fichier manquant.' };
  }
  const meta = {
    type: formData.get('type'),
    libelle: formData.get('libelle'),
  };
  const parsedMeta = logoUploadMetaSchema.safeParse(meta);
  if (!parsedMeta.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsedMeta.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const mime = file.type;
  if (!LOGO_MIME_AUTORISES.includes(mime as (typeof LOGO_MIME_AUTORISES)[number])) {
    return {
      ok: false,
      error: 'Format de logo non supporté. Formats acceptés : PNG, JPEG, WebP, SVG.',
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'Fichier vide.' };
  }
  if (file.size > LOGO_TAILLE_MAX_OCTETS) {
    return {
      ok: false,
      error: `Logo trop volumineux (max ${Math.round(LOGO_TAILLE_MAX_OCTETS / 1024 / 1024)} Mo).`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = genererStorageKey(entrepriseId, mime);

  // Upload S3 d'abord (hors transaction DB) ; en cas d'échec DB en aval, on
  // appelle deleteObject() en compensation.
  await putObject(storageKey, buffer, mime);

  let cleAObjetSupprimer: string | null = null;

  try {
    const id = await withTenant(entrepriseId, async (tx) => {
      if (parsedMeta.data.type === 'principal') {
        const [ancien] = await tx
          .select({ id: entrepriseLogos.id, storageKey: entrepriseLogos.storageKey })
          .from(entrepriseLogos)
          .where(and(eq(entrepriseLogos.type, 'principal'), isNull(entrepriseLogos.deletedAt)))
          .limit(1);
        if (ancien) {
          await tx
            .update(entrepriseLogos)
            .set({ deletedAt: new Date() })
            .where(eq(entrepriseLogos.id, ancien.id));
          cleAObjetSupprimer = ancien.storageKey;
        }
      }

      // Ordre = max existant + 1 pour le même type
      const [maxOrdre] = await tx
        .select({ max: sql<number>`coalesce(max(${entrepriseLogos.ordre}), -1)::int` })
        .from(entrepriseLogos)
        .where(
          and(eq(entrepriseLogos.type, parsedMeta.data.type), isNull(entrepriseLogos.deletedAt)),
        );

      const [inserted] = await tx
        .insert(entrepriseLogos)
        .values({
          entrepriseId,
          type: parsedMeta.data.type,
          libelle: parsedMeta.data.libelle,
          storageKey,
          mimeType: mime,
          tailleOctets: file.size,
          ordre: (maxOrdre?.max ?? -1) + 1,
        })
        .returning({ id: entrepriseLogos.id });
      if (!inserted) throw new Error('INSERT logo silently failed');

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'entreprise_logos',
        rowId: inserted.id,
        after: {
          type: parsedMeta.data.type,
          libelle: parsedMeta.data.libelle,
          storageKey,
          tailleOctets: file.size,
          parUtilisateur: utilisateur.id,
        },
      });

      return inserted.id;
    });

    if (cleAObjetSupprimer) {
      // Best-effort : suppression de l'ancien objet S3 (le soft-delete DB suffit pour la cohérence)
      try {
        await deleteObject(cleAObjetSupprimer);
      } catch {
        // ignoré : la clé peut être référencée par un audit historique
      }
    }

    pathsToRevalidate(entrepriseSlug);
    return { ok: true, data: { id } };
  } catch (err) {
    // Compensation : retirer l'objet S3 fraîchement uploadé puisque la DB a échoué
    try {
      await deleteObject(storageKey);
    } catch {
      /* ignoré */
    }
    throw err;
  }
}

export async function renommerLogo(id: string, input: LogoRenommerInput): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const parsed = logoRenommerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Libellé invalide.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(entrepriseLogos)
      .where(and(eq(entrepriseLogos.id, id), isNull(entrepriseLogos.deletedAt)))
      .limit(1);
    if (!before) throw new Error('Logo introuvable.');

    await tx
      .update(entrepriseLogos)
      .set({ libelle: parsed.data.libelle, updatedAt: new Date() })
      .where(eq(entrepriseLogos.id, id));

    await auditLogIn(tx, {
      action: 'update',
      tableName: 'entreprise_logos',
      rowId: id,
      before: { libelle: before.libelle },
      after: { libelle: parsed.data.libelle },
    });
  });

  pathsToRevalidate(ctx.entreprise.slug);
  return { ok: true, data: undefined };
}

export async function supprimerLogo(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();

  let cleASupprimer: string | null = null;
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [target] = await tx
      .select()
      .from(entrepriseLogos)
      .where(and(eq(entrepriseLogos.id, id), isNull(entrepriseLogos.deletedAt)))
      .limit(1);
    if (!target) throw new Error('Logo introuvable.');

    await tx
      .update(entrepriseLogos)
      .set({ deletedAt: new Date() })
      .where(eq(entrepriseLogos.id, id));

    cleASupprimer = target.storageKey;

    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'entreprise_logos',
      rowId: id,
      before: target,
    });
  });

  if (cleASupprimer) {
    try {
      await deleteObject(cleASupprimer);
    } catch {
      /* ignoré */
    }
  }

  pathsToRevalidate(ctx.entreprise.slug);
  return { ok: true, data: undefined };
}

export async function reordonnerLogos(input: LogoReorderInput): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const parsed = logoReorderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Ordre invalide.' };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    for (const { id, ordre } of parsed.data) {
      await tx
        .update(entrepriseLogos)
        .set({ ordre, updatedAt: new Date() })
        .where(and(eq(entrepriseLogos.id, id), isNull(entrepriseLogos.deletedAt)));
    }
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'entreprise_logos',
      rowId: ctx.entreprise.id,
      after: { reorder: parsed.data },
    });
  });

  pathsToRevalidate(ctx.entreprise.slug);
  return { ok: true, data: undefined };
}

export async function listerLogos(type?: LogoType) {
  const ctx = await requireAdmin();
  const conditions = [isNull(entrepriseLogos.deletedAt)];
  if (type) {
    const t = logoTypeSchema.parse(type);
    conditions.push(eq(entrepriseLogos.type, t));
  }
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: entrepriseLogos.id,
        type: entrepriseLogos.type,
        libelle: entrepriseLogos.libelle,
        storageKey: entrepriseLogos.storageKey,
        mimeType: entrepriseLogos.mimeType,
        tailleOctets: entrepriseLogos.tailleOctets,
        ordre: entrepriseLogos.ordre,
        createdAt: entrepriseLogos.createdAt,
      })
      .from(entrepriseLogos)
      .where(and(...conditions))
      .orderBy(asc(entrepriseLogos.type), asc(entrepriseLogos.ordre)),
  );
}

// ─────────────────────────────────────────────────────────────
// Conditions générales (CGV / CGA)
// ─────────────────────────────────────────────────────────────

/**
 * Crée une nouvelle version (CGV ou CGA). La version précédente reste
 * accessible en consultation — la "version active" est calculée côté lecture
 * comme la version la plus récente dont `date_effet <= today`.
 */
export async function creerVersionConditions(
  input: ConditionNouvelleVersionInput,
): Promise<ActionResult<{ id: string; version: number }>> {
  const ctx = await requireAdmin();
  const parsed = conditionNouvelleVersionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const contenuPropre = sanitizeConditionsHtml(parsed.data.contenuHtml);
  if (contenuPropre.replace(/<[^>]*>/g, '').trim().length === 0) {
    return { ok: false, error: 'Le contenu est vide après nettoyage HTML.' };
  }

  const result = await withTenant(ctx.entreprise.id, async (tx) => {
    const [maxVersion] = await tx
      .select({ max: sql<number>`coalesce(max(${entrepriseConditions.version}), 0)::int` })
      .from(entrepriseConditions)
      .where(
        and(
          eq(entrepriseConditions.type, parsed.data.type),
          isNull(entrepriseConditions.deletedAt),
        ),
      );

    const prochaineVersion = (maxVersion?.max ?? 0) + 1;

    const [inserted] = await tx
      .insert(entrepriseConditions)
      .values({
        entrepriseId: ctx.entreprise.id,
        type: parsed.data.type,
        version: prochaineVersion,
        contenuHtml: contenuPropre,
        contenuJson: (parsed.data.contenuJson as object | null) ?? null,
        dateEffet: parsed.data.dateEffet,
        commentaire: parsed.data.commentaire,
        createdBy: ctx.utilisateur.id,
      })
      .returning({ id: entrepriseConditions.id, version: entrepriseConditions.version });
    if (!inserted) throw new Error('INSERT condition silently failed');

    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'entreprise_conditions',
      rowId: inserted.id,
      after: {
        type: parsed.data.type,
        version: inserted.version,
        dateEffet: parsed.data.dateEffet,
        tailleHtml: contenuPropre.length,
        commentaire: parsed.data.commentaire,
      },
    });

    return inserted;
  });

  pathsToRevalidate(ctx.entreprise.slug);
  return { ok: true, data: { id: result.id, version: result.version } };
}

export async function supprimerVersionConditions(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [target] = await tx
      .select()
      .from(entrepriseConditions)
      .where(and(eq(entrepriseConditions.id, id), isNull(entrepriseConditions.deletedAt)))
      .limit(1);
    if (!target) throw new Error('Version introuvable.');

    await tx
      .update(entrepriseConditions)
      .set({ deletedAt: new Date() })
      .where(eq(entrepriseConditions.id, id));

    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'entreprise_conditions',
      rowId: id,
      before: { type: target.type, version: target.version, dateEffet: target.dateEffet },
    });
  });

  pathsToRevalidate(ctx.entreprise.slug);
  return { ok: true, data: undefined };
}

export async function listerVersionsConditions(type: ConditionType) {
  const ctx = await requireAdmin();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: entrepriseConditions.id,
        type: entrepriseConditions.type,
        version: entrepriseConditions.version,
        dateEffet: entrepriseConditions.dateEffet,
        commentaire: entrepriseConditions.commentaire,
        createdAt: entrepriseConditions.createdAt,
        tailleHtml: sql<number>`length(${entrepriseConditions.contenuHtml})::int`,
      })
      .from(entrepriseConditions)
      .where(and(eq(entrepriseConditions.type, type), isNull(entrepriseConditions.deletedAt)))
      .orderBy(desc(entrepriseConditions.dateEffet), desc(entrepriseConditions.version)),
  );
}

export async function lireVersionConditions(id: string) {
  const ctx = await requireAdmin();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(entrepriseConditions)
      .where(and(eq(entrepriseConditions.id, id), isNull(entrepriseConditions.deletedAt)))
      .limit(1);
    return row ?? null;
  });
}
