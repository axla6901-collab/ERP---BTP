'use server';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { auth } from '@/lib/auth/server';
import { requireSuperAdmin } from '@/lib/auth/tenant-guards';
import { auditLogEvent } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { getDbAdmin } from '@/lib/db/client';
import { user } from '@/db/schema/auth';
import {
  entrepriseLogos,
  entreprises,
  utilisateurEntreprises,
} from '@/db/schema/entreprises';
import { roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  entrepriseCreateSchema,
  entrepriseUpdateSchema,
  type EntrepriseCreateInput,
  type EntrepriseUpdateInput,
} from '@/lib/validation/super-admin';
import {
  logoRenommerSchema,
  logoUploadMetaSchema,
  LOGO_MIME_AUTORISES,
  LOGO_TAILLE_MAX_OCTETS,
} from '@/lib/validation/entreprise';
import { deleteObject, putObject } from '@/lib/storage/s3';

/**
 * Server actions de la console super-admin (`/admin/entreprises`).
 *
 * Toutes les opérations passent par le pool `dbAdmin` (rôle `app_admin` BYPASSRLS)
 * car elles sont par nature **cross-tenant** : créer une nouvelle entreprise,
 * lister toutes les entreprises, etc.
 *
 * Garde-fou systématique : `requireSuperAdmin()` qui exige `utilisateurs.is_super_admin = true`.
 */

export type EntrepriseListItem = {
  id: string;
  slug: string;
  raisonSociale: string;
  siret: string | null;
  adresseLigne1: string | null;
  codePostal: string | null;
  ville: string | null;
  actif: boolean;
  createdAt: Date;
  membresCount: number;
  /** Clé S3 du logo principal (à transformer en URL signée côté page). */
  logoPrincipalStorageKey: string | null;
};

export type EntrepriseDetail = {
  id: string;
  slug: string;
  raisonSociale: string;
  siret: string | null;
  tvaIntracom: string | null;
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string;
  iban: string | null;
  bic: string | null;
  rcs: string | null;
  formeJuridique: string | null;
  capitalSocial: string | null;
  codeApe: string | null;
  actif: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Clé S3 du logo principal s'il existe — à transformer en URL signée côté page. */
  logoPrincipalStorageKey: string | null;
  membres: Array<{
    utilisateurId: string;
    email: string;
    roleCode: string;
    roleLibelle: string;
    isDefault: boolean;
  }>;
  stats: {
    devis: number;
    factures: number;
    chantiers: number;
    clients: number;
  };
};

export async function listerEntreprises(): Promise<EntrepriseListItem[]> {
  await requireSuperAdmin();
  const db = getDbAdmin();
  const rows = await db
    .select({
      id: entreprises.id,
      slug: entreprises.slug,
      raisonSociale: entreprises.raisonSociale,
      siret: entreprises.siret,
      adresseLigne1: entreprises.adresseLigne1,
      codePostal: entreprises.codePostal,
      ville: entreprises.ville,
      actif: entreprises.actif,
      createdAt: entreprises.createdAt,
      membresCount: sql<number>`
        (SELECT COUNT(*)::int FROM utilisateur_entreprises ue
         WHERE ue.entreprise_id = entreprises.id AND ue.deleted_at IS NULL)
      `,
      logoPrincipalStorageKey: sql<string | null>`
        (SELECT storage_key FROM entreprise_logos el
         WHERE el.entreprise_id = entreprises.id
           AND el.type = 'principal'
           AND el.deleted_at IS NULL
         LIMIT 1)
      `,
    })
    .from(entreprises)
    .where(isNull(entreprises.deletedAt))
    .orderBy(desc(entreprises.createdAt));
  return rows;
}

/**
 * Détail complet d'une entreprise pour la fiche `/admin/entreprises/[id]` :
 *  - infos identification + adresse
 *  - liste des membres avec leur rôle dans cette entreprise
 *  - compteurs d'activité (devis, factures, chantiers, clients) hors soft-deleted
 *
 * Passe par `dbAdmin` (BYPASSRLS) — opération cross-tenant.
 * Retourne `null` si l'entreprise est introuvable ou soft-deleted.
 */
export async function getEntrepriseDetail(id: string): Promise<EntrepriseDetail | null> {
  await requireSuperAdmin();
  const db = getDbAdmin();

  const [entreprise] = await db
    .select()
    .from(entreprises)
    .where(and(eq(entreprises.id, id), isNull(entreprises.deletedAt)))
    .limit(1);
  if (!entreprise) return null;

  const membres = await db
    .select({
      utilisateurId: utilisateurEntreprises.utilisateurId,
      email: utilisateurs.email,
      roleCode: roles.code,
      roleLibelle: roles.libelle,
      isDefault: utilisateurEntreprises.isDefault,
    })
    .from(utilisateurEntreprises)
    .innerJoin(utilisateurs, eq(utilisateurs.id, utilisateurEntreprises.utilisateurId))
    .innerJoin(roles, eq(roles.id, utilisateurEntreprises.roleId))
    .where(
      and(
        eq(utilisateurEntreprises.entrepriseId, id),
        isNull(utilisateurEntreprises.deletedAt),
        isNull(utilisateurs.deletedAt),
      ),
    )
    .orderBy(utilisateurs.email);

  const [statsRow] = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM devis     WHERE entreprise_id = ${id} AND deleted_at IS NULL) AS devis,
      (SELECT COUNT(*)::int FROM factures  WHERE entreprise_id = ${id} AND deleted_at IS NULL) AS factures,
      (SELECT COUNT(*)::int FROM chantiers WHERE entreprise_id = ${id} AND deleted_at IS NULL) AS chantiers,
      (SELECT COUNT(*)::int FROM clients   WHERE entreprise_id = ${id} AND deleted_at IS NULL) AS clients
  `)) as unknown as Array<{ devis: number; factures: number; chantiers: number; clients: number }>;

  const [logoRow] = await db
    .select({ storageKey: entrepriseLogos.storageKey })
    .from(entrepriseLogos)
    .where(
      and(
        eq(entrepriseLogos.entrepriseId, id),
        eq(entrepriseLogos.type, 'principal'),
        isNull(entrepriseLogos.deletedAt),
      ),
    )
    .limit(1);

  return {
    id: entreprise.id,
    slug: entreprise.slug,
    raisonSociale: entreprise.raisonSociale,
    siret: entreprise.siret,
    tvaIntracom: entreprise.tvaIntracom,
    adresseLigne1: entreprise.adresseLigne1,
    adresseLigne2: entreprise.adresseLigne2,
    codePostal: entreprise.codePostal,
    ville: entreprise.ville,
    pays: entreprise.pays,
    iban: entreprise.iban,
    bic: entreprise.bic,
    rcs: entreprise.rcs,
    formeJuridique: entreprise.formeJuridique,
    capitalSocial: entreprise.capitalSocial,
    codeApe: entreprise.codeApe,
    actif: entreprise.actif,
    createdAt: entreprise.createdAt,
    updatedAt: entreprise.updatedAt,
    logoPrincipalStorageKey: logoRow?.storageKey ?? null,
    membres,
    stats: statsRow ?? { devis: 0, factures: 0, chantiers: 0, clients: 0 },
  };
}

export async function creerEntreprise(
  input: EntrepriseCreateInput,
): Promise<ActionResult<{ id: string; slug: string; newUser: boolean }>> {
  const superAdmin = await requireSuperAdmin();
  const parsed = entrepriseCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { adminEmail, ...entrepriseFields } = parsed.data;

  const db = getDbAdmin();

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Crée l'entreprise
      const [entreprise] = await tx
        .insert(entreprises)
        .values(entrepriseFields)
        .returning({ id: entreprises.id, slug: entreprises.slug });
      if (!entreprise) throw new Error('INSERT entreprise vide');

      // 2. Résout le rôle 'admin'
      const [roleAdmin] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.code, 'admin'))
        .limit(1);
      if (!roleAdmin) throw new Error('Rôle système "admin" introuvable.');

      // 3. Trouve OU crée le user
      const [existingUser] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, adminEmail))
        .limit(1);

      let userId: string;
      let newUser = false;
      if (existingUser) {
        userId = existingUser.id;
      } else {
        const [roleLectureSeule] = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.code, 'lecture_seule'))
          .limit(1);
        if (!roleLectureSeule) throw new Error('Rôle système "lecture_seule" introuvable.');

        // Identifiant Better-Auth : nanoid-like (alphanumérique URL-safe, ~21 chars)
        userId = crypto.randomUUID().replace(/-/g, '');
        await tx.insert(user).values({
          id: userId,
          name: adminEmail.split('@')[0] ?? adminEmail,
          email: adminEmail,
          emailVerified: false,
        });
        // Le hook databaseHooks.user.create.after de Better-Auth N'EST PAS appelé
        // sur un INSERT direct → on duplique sa logique ici.
        await tx
          .insert(utilisateurs)
          .values({ id: userId, email: adminEmail, roleId: roleLectureSeule.id });
        newUser = true;
      }

      // 4. Binding utilisateur ↔ entreprise avec rôle admin
      await tx
        .insert(utilisateurEntreprises)
        .values({
          utilisateurId: userId,
          entrepriseId: entreprise.id,
          roleId: roleAdmin.id,
          isDefault: !existingUser, // par défaut pour un nouveau user, sinon il choisit
        })
        .onConflictDoNothing();

      return { id: entreprise.id, slug: entreprise.slug, newUser, userId };
    });

    // 5. Audit (hors transaction — entreprise_id NULL = action super-admin cross-tenant)
    await auditLogEvent({
      action: 'insert',
      tableName: 'entreprises',
      rowId: result.id,
      after: { slug: result.slug, raisonSociale: entrepriseFields.raisonSociale, adminEmail },
      utilisateurId: superAdmin.id,
    });

    // 6. Magic-link (best-effort, non bloquant)
    try {
      const reqHeaders = await headers();
      await auth.api.signInMagicLink({
        body: { email: adminEmail, callbackURL: `/${result.slug}/dashboard` },
        headers: reqHeaders,
      });
    } catch (err) {
      // SMTP indisponible en dev ne doit pas bloquer la création d'entreprise
      console.warn(`[creerEntreprise] envoi magic-link à ${adminEmail} échoué :`, err);
    }

    revalidatePath('/admin/entreprises');
    return { ok: true, data: { id: result.id, slug: result.slug, newUser: result.newUser } };
  } catch (err) {
    if (err instanceof Error) {
      if (/duplicate key|unique/i.test(err.message)) {
        return { ok: false, error: `Une entreprise avec le slug "${parsed.data.slug}" existe déjà.` };
      }
      if (/chk_entreprises_slug/i.test(err.message)) {
        return { ok: false, error: 'Format de slug invalide.' };
      }
    }
    throw err;
  }
}

export async function mettreAJourEntreprise(
  id: string,
  input: EntrepriseUpdateInput,
): Promise<ActionResult> {
  const superAdmin = await requireSuperAdmin();
  const parsed = entrepriseUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const db = getDbAdmin();
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(entreprises)
        .where(and(eq(entreprises.id, id), isNull(entreprises.deletedAt)))
        .limit(1);
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(entreprises)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(entreprises.id, id));
    });

    await auditLogEvent({
      action: 'update',
      tableName: 'entreprises',
      rowId: id,
      after: parsed.data,
      utilisateurId: superAdmin.id,
    });
    revalidatePath('/admin/entreprises');
    revalidatePath(`/admin/entreprises/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Entreprise introuvable.' };
    }
    throw err;
  }
}

/**
 * Désactivation soft (actif=false + deleted_at) d'une entreprise.
 * Les données restent en DB ; les utilisateurs membres ne peuvent plus la sélectionner.
 */
export async function desactiverEntreprise(id: string): Promise<ActionResult> {
  const superAdmin = await requireSuperAdmin();
  const db = getDbAdmin();
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(entreprises)
        .where(and(eq(entreprises.id, id), isNull(entreprises.deletedAt)))
        .limit(1);
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(entreprises)
        .set({ actif: false, deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(entreprises.id, id));
    });

    await auditLogEvent({
      action: 'delete',
      tableName: 'entreprises',
      rowId: id,
      utilisateurId: superAdmin.id,
    });
    revalidatePath('/admin/entreprises');
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Entreprise introuvable ou déjà désactivée.' };
    }
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Logos super-admin (cross-tenant)
//
// Variantes des actions `lib/admin/entreprise.ts` qui prennent `entrepriseId`
// en paramètre et passent par `dbAdmin` (BYPASSRLS). Audit via `auditLogEvent`
// (entreprise_id = NULL = action cross-tenant traçable).
// ────────────────────────────────────────────────────────────────────────────

function genererStorageKeyLogo(entrepriseId: string, mime: string): string {
  const extension =
    mime === 'image/png'
      ? 'png'
      : mime === 'image/jpeg'
        ? 'jpg'
        : mime === 'image/webp'
          ? 'webp'
          : 'svg';
  return `entreprises/${entrepriseId}/logos/${crypto.randomUUID()}.${extension}`;
}

export type LogoSuperRow = {
  id: string;
  type: 'principal' | 'certification';
  libelle: string;
  storageKey: string;
  mimeType: string;
  tailleOctets: number;
  ordre: number;
  createdAt: Date;
};

export async function listerLogosSuper(entrepriseId: string): Promise<LogoSuperRow[]> {
  await requireSuperAdmin();
  const db = getDbAdmin();
  return db
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
    .where(
      and(eq(entrepriseLogos.entrepriseId, entrepriseId), isNull(entrepriseLogos.deletedAt)),
    )
    .orderBy(entrepriseLogos.type, entrepriseLogos.ordre);
}

export async function uploadLogoSuper(
  entrepriseId: string,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const superAdmin = await requireSuperAdmin();

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Fichier manquant.' };

  const parsedMeta = logoUploadMetaSchema.safeParse({
    type: formData.get('type'),
    libelle: formData.get('libelle'),
  });
  if (!parsedMeta.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsedMeta.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const mime = file.type;
  if (!LOGO_MIME_AUTORISES.includes(mime as (typeof LOGO_MIME_AUTORISES)[number])) {
    return { ok: false, error: 'Format non supporté (PNG, JPEG, WebP, SVG).' };
  }
  if (file.size <= 0) return { ok: false, error: 'Fichier vide.' };
  if (file.size > LOGO_TAILLE_MAX_OCTETS) {
    return {
      ok: false,
      error: `Logo trop volumineux (max ${Math.round(LOGO_TAILLE_MAX_OCTETS / 1024 / 1024)} Mo).`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = genererStorageKeyLogo(entrepriseId, mime);
  await putObject(storageKey, buffer, mime);

  const db = getDbAdmin();
  let cleAObjetSupprimer: string | null = null;

  try {
    const id = await db.transaction(async (tx) => {
      if (parsedMeta.data.type === 'principal') {
        const [ancien] = await tx
          .select({ id: entrepriseLogos.id, storageKey: entrepriseLogos.storageKey })
          .from(entrepriseLogos)
          .where(
            and(
              eq(entrepriseLogos.entrepriseId, entrepriseId),
              eq(entrepriseLogos.type, 'principal'),
              isNull(entrepriseLogos.deletedAt),
            ),
          )
          .limit(1);
        if (ancien) {
          await tx
            .update(entrepriseLogos)
            .set({ deletedAt: new Date() })
            .where(eq(entrepriseLogos.id, ancien.id));
          cleAObjetSupprimer = ancien.storageKey;
        }
      }

      const [maxOrdre] = await tx
        .select({ max: sql<number>`coalesce(max(${entrepriseLogos.ordre}), -1)::int` })
        .from(entrepriseLogos)
        .where(
          and(
            eq(entrepriseLogos.entrepriseId, entrepriseId),
            eq(entrepriseLogos.type, parsedMeta.data.type),
            isNull(entrepriseLogos.deletedAt),
          ),
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
      return inserted.id;
    });

    await auditLogEvent({
      action: 'insert',
      tableName: 'entreprise_logos',
      rowId: id,
      after: {
        entrepriseId,
        type: parsedMeta.data.type,
        libelle: parsedMeta.data.libelle,
        storageKey,
        tailleOctets: file.size,
        viaSuperAdmin: true,
      },
      utilisateurId: superAdmin.id,
    });

    if (cleAObjetSupprimer) {
      try {
        await deleteObject(cleAObjetSupprimer);
      } catch {
        /* ignoré */
      }
    }

    revalidatePath(`/admin/entreprises/${entrepriseId}`);
    revalidatePath('/admin/entreprises');
    return { ok: true, data: { id } };
  } catch (err) {
    try {
      await deleteObject(storageKey);
    } catch {
      /* ignoré */
    }
    throw err;
  }
}

export async function renommerLogoSuper(
  entrepriseId: string,
  id: string,
  libelle: string,
): Promise<ActionResult> {
  const superAdmin = await requireSuperAdmin();
  const parsed = logoRenommerSchema.safeParse({ libelle });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Libellé invalide.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const db = getDbAdmin();
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(entrepriseLogos)
      .where(
        and(
          eq(entrepriseLogos.id, id),
          eq(entrepriseLogos.entrepriseId, entrepriseId),
          isNull(entrepriseLogos.deletedAt),
        ),
      )
      .limit(1);
    if (!before) throw new Error('Logo introuvable.');

    await tx
      .update(entrepriseLogos)
      .set({ libelle: parsed.data.libelle, updatedAt: new Date() })
      .where(eq(entrepriseLogos.id, id));
  });

  await auditLogEvent({
    action: 'update',
    tableName: 'entreprise_logos',
    rowId: id,
    after: { libelle: parsed.data.libelle, viaSuperAdmin: true },
    utilisateurId: superAdmin.id,
  });

  revalidatePath(`/admin/entreprises/${entrepriseId}`);
  return { ok: true, data: undefined };
}

export async function supprimerLogoSuper(
  entrepriseId: string,
  id: string,
): Promise<ActionResult> {
  const superAdmin = await requireSuperAdmin();

  const db = getDbAdmin();
  let cleASupprimer: string | null = null;
  await db.transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(entrepriseLogos)
      .where(
        and(
          eq(entrepriseLogos.id, id),
          eq(entrepriseLogos.entrepriseId, entrepriseId),
          isNull(entrepriseLogos.deletedAt),
        ),
      )
      .limit(1);
    if (!target) throw new Error('Logo introuvable.');

    await tx
      .update(entrepriseLogos)
      .set({ deletedAt: new Date() })
      .where(eq(entrepriseLogos.id, id));
    cleASupprimer = target.storageKey;
  });

  await auditLogEvent({
    action: 'delete',
    tableName: 'entreprise_logos',
    rowId: id,
    after: { viaSuperAdmin: true },
    utilisateurId: superAdmin.id,
  });

  if (cleASupprimer) {
    try {
      await deleteObject(cleASupprimer);
    } catch {
      /* ignoré */
    }
  }

  revalidatePath(`/admin/entreprises/${entrepriseId}`);
  revalidatePath('/admin/entreprises');
  return { ok: true, data: undefined };
}
