'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { peutAdministrer, ROLES_ADMINISTRATION } from '@/lib/admin/permissions';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa, type TenantContext } from '@/lib/auth/tenant-guards';
import { db } from '@/lib/db/client';
import { withTenant } from '@/lib/db/with-tenant';
import { rolePermissions, roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  matriceBatchSchema,
  roleCreateSchema,
  roleUpdateSchema,
  type MatriceBatch,
  type RoleCreateInput,
  type RoleUpdateInput,
} from '@/lib/validation/admin';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Garde des server actions du module Administration > Rôles.
 *
 * Note multi-tenant : la table `roles` (matrice RBAC) est **globale** — les
 * SELECT/INSERT/UPDATE ne sont pas filtrés par la RLS tenant. On exécute
 * néanmoins les mutations dans `withTenant(ctx.entreprise.id, ...)` car
 * `auditLogIn` écrit dans `audit_log` (table tenant, RLS `p_tenant`) et lit la
 * GUC `app.current_entreprise_id` posée par `withTenant`. Sans ce wrapper,
 * l'INSERT d'audit échoue (`''::uuid`). L'action est ainsi tracée au nom de
 * l'entreprise active de l'admin.
 */
async function requireAdmin(): Promise<TenantContext> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  if (!peutAdministrer(ctx.utilisateur.role)) {
    throw new Error('Accès refusé : section Administration réservée aux administrateurs.');
  }
  return ctx;
}

export async function creerRole(input: RoleCreateInput): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdmin();
  const parsed = roleCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(roles)
        .values({
          code: parsed.data.code,
          libelle: parsed.data.libelle,
          description: parsed.data.description,
          systeme: false,
          actif: parsed.data.actif,
        })
        .returning({ id: roles.id });
      if (!inserted) throw new Error('INSERT failed silently');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'roles',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/roles`);
    revalidatePath(`/${ctx.entreprise.slug}/administration`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" existe déjà.` };
    }
    throw err;
  }
}

export async function mettreAJourRole(id: string, input: RoleUpdateInput): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const parsed = roleUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!before) throw new Error('Rôle introuvable.');
    await tx
      .update(roles)
      .set({
        libelle: parsed.data.libelle,
        description: parsed.data.description,
        actif: parsed.data.actif,
        updatedAt: new Date(),
      })
      .where(eq(roles.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'roles',
      rowId: id,
      before,
      after: parsed.data,
    });
  });
  revalidatePath(`/${ctx.entreprise.slug}/administration/roles`);
  revalidatePath(`/${ctx.entreprise.slug}/administration/roles/${id}`);
  return { ok: true, data: undefined };
}

export async function dupliquerRole(id: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdmin();

  const nouvelId = await withTenant(ctx.entreprise.id, async (tx) => {
    const [source] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!source) throw new Error('Rôle source introuvable.');

    // Trouver un code unique : <code>_copie, _copie_2, ...
    const base = `${source.code}_copie`;
    let candidat = base;
    let suffixe = 1;
    // Limite raisonnable pour éviter une boucle infinie
    for (let i = 0; i < 100; i += 1) {
      const [existant] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.code, candidat))
        .limit(1);
      if (!existant) break;
      suffixe += 1;
      candidat = `${base}_${suffixe}`;
    }

    const [inserted] = await tx
      .insert(roles)
      .values({
        code: candidat,
        libelle: `${source.libelle} (copie)`,
        description: source.description,
        systeme: false,
        actif: source.actif,
      })
      .returning({ id: roles.id });
    if (!inserted) throw new Error('INSERT failed silently');

    const perms = await tx
      .select({ permissionId: rolePermissions.permissionId })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id));
    if (perms.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(perms.map((p) => ({ roleId: inserted.id, permissionId: p.permissionId })));
    }

    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'roles',
      rowId: inserted.id,
      after: { dupliqueDe: id, code: candidat, nbPermissions: perms.length },
    });
    return inserted.id;
  });

  revalidatePath(`/${ctx.entreprise.slug}/administration/roles`);
  return { ok: true, data: { id: nouvelId } };
}

export async function supprimerRole(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [target] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
      if (!target) throw new Error('Rôle introuvable.');
      if (target.systeme) {
        throw new Error('Impossible de supprimer un rôle système.');
      }
      const [compte] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(utilisateurs)
        .where(eq(utilisateurs.roleId, id));
      const n = compte?.n ?? 0;
      if (n > 0) {
        throw new Error(
          `Impossible de supprimer : ${n} utilisateur${n > 1 ? 's' : ''} encore rattaché${n > 1 ? 's' : ''} à ce rôle.`,
        );
      }
      await tx.delete(roles).where(eq(roles.id, id));
      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'roles',
        rowId: id,
        before: target,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/roles`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Suppression impossible.',
    };
  }
}

export async function basculerActif(id: string, actif: boolean): Promise<ActionResult> {
  const ctx = await requireAdmin();
  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!before) throw new Error('Rôle introuvable.');
    await tx.update(roles).set({ actif, updatedAt: new Date() }).where(eq(roles.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'roles',
      rowId: id,
      before: { actif: before.actif },
      after: { actif },
    });
  });
  revalidatePath(`/${ctx.entreprise.slug}/administration/roles`);
  return { ok: true, data: undefined };
}

export async function enregistrerMatrice(
  changements: MatriceBatch,
): Promise<ActionResult<{ applied: number }>> {
  const ctx = await requireAdmin();
  const parsed = matriceBatchSchema.safeParse(changements);
  if (!parsed.success) {
    return { ok: false, error: 'Changements invalides.' };
  }
  if (parsed.data.length === 0) {
    return { ok: true, data: { applied: 0 } };
  }

  // Garde-fou : les permissions du rôle `admin` (système) ne sont pas
  // modifiables via UI pour éviter qu'un admin se verrouille hors d'accès.
  const idsRoles = Array.from(new Set(parsed.data.map((c) => c.roleId)));
  const rolesImpactes = await db
    .select({ id: roles.id, code: roles.code })
    .from(roles)
    .where(inArray(roles.id, idsRoles));
  const adminRoleId = rolesImpactes.find((r) => r.code === 'admin')?.id;
  if (adminRoleId && parsed.data.some((c) => c.roleId === adminRoleId)) {
    return {
      ok: false,
      error: 'Les permissions du rôle "admin" ne sont pas modifiables (verrou de sécurité).',
    };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const aAjouter = parsed.data.filter((c) => c.granted);
    const aRetirer = parsed.data.filter((c) => !c.granted);

    if (aAjouter.length > 0) {
      await tx
        .insert(rolePermissions)
        .values(
          aAjouter.map((c) => ({
            roleId: c.roleId,
            permissionId: c.permissionId,
            grantedBy: ctx.utilisateur.id,
          })),
        )
        .onConflictDoNothing();
    }
    for (const c of aRetirer) {
      await tx
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, c.roleId),
            eq(rolePermissions.permissionId, c.permissionId),
          ),
        );
    }

    // Un log par rôle impacté avec le diff appliqué.
    for (const roleId of idsRoles) {
      const changesParRole = parsed.data.filter((c) => c.roleId === roleId);
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'role_permissions',
        rowId: roleId,
        after: { changements: changesParRole },
      });
    }
  });
  revalidatePath(`/${ctx.entreprise.slug}/administration/roles`);
  return { ok: true, data: { applied: parsed.data.length } };
}
