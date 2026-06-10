'use server';

import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { peutAdministrer, ROLES_ADMINISTRATION } from '@/lib/admin/permissions';
import { auditLogIn } from '@/lib/audit/log';
import {
  requireTenantContextWithMfa,
  type TenantContext,
} from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  utilisateurEditSchema,
  type UtilisateurEditInput,
} from '@/lib/validation/admin';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Garde des server actions du module Administration > Utilisateurs.
 *
 * Note multi-tenant : la table `utilisateurs` est **globale** (un user peut
 * être membre de plusieurs entreprises via `utilisateur_entreprises`) et n'est
 * pas filtrée par la RLS tenant. On exécute néanmoins les mutations dans
 * `withTenant(ctx.entreprise.id, ...)` car `auditLogIn` écrit dans `audit_log`
 * (table tenant, RLS `p_tenant`) et lit la GUC `app.current_entreprise_id`
 * posée par `withTenant`. Sans ce wrapper, l'INSERT d'audit échoue (`''::uuid`).
 */
async function requireAdmin(): Promise<TenantContext> {
  const ctx = await requireTenantContextWithMfa(ROLES_ADMINISTRATION);
  if (!peutAdministrer(ctx.utilisateur.role)) {
    throw new Error('Accès refusé : section Administration réservée aux administrateurs.');
  }
  return ctx;
}

type Tx = TenantTx;

/**
 * Vrai si l'utilisateur cible est le SEUL admin actif (= rôle `admin` + actif=true + non supprimé).
 * Sert à refuser toute opération qui retirerait ce dernier rempart d'accès.
 */
async function estSeulAdminActif(tx: Tx, userId: string): Promise<boolean> {
  const [roleAdmin] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.code, 'admin'))
    .limit(1);
  if (!roleAdmin) return false;

  const adminsActifs = await tx
    .select({ id: utilisateurs.id })
    .from(utilisateurs)
    .where(
      and(
        eq(utilisateurs.roleId, roleAdmin.id),
        eq(utilisateurs.actif, true),
        isNull(utilisateurs.deletedAt),
      ),
    );

  return adminsActifs.length === 1 && adminsActifs[0]?.id === userId;
}

async function estRoleAdmin(tx: Tx, roleId: string): Promise<boolean> {
  const [r] = await tx
    .select({ code: roles.code })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  return r?.code === 'admin';
}

export async function mettreAJourUtilisateur(
  utilisateurId: string,
  input: UtilisateurEditInput,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const moi = ctx.utilisateur;
  const parsed = utilisateurEditSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(utilisateurs)
        .where(eq(utilisateurs.id, utilisateurId))
        .limit(1);
      if (!before) throw new Error('Utilisateur introuvable.');

      const cibleEstSeulAdmin = await estSeulAdminActif(tx, utilisateurId);
      const nouveauRoleEstAdmin = await estRoleAdmin(tx, parsed.data.roleId);

      // Garde-fous : ne pas perdre le dernier admin actif
      if (cibleEstSeulAdmin && !nouveauRoleEstAdmin) {
        throw new Error(
          'Action refusée : c\'est le dernier administrateur actif. Promouvoir un autre utilisateur admin d\'abord.',
        );
      }
      if (cibleEstSeulAdmin && !parsed.data.actif) {
        throw new Error(
          'Action refusée : c\'est le dernier administrateur actif. Impossible de le désactiver.',
        );
      }
      // Garde-fou : on ne se rétrograde pas soi-même
      if (utilisateurId === moi.id && !nouveauRoleEstAdmin) {
        throw new Error('Action refusée : tu ne peux pas retirer ton propre rôle admin.');
      }
      if (utilisateurId === moi.id && !parsed.data.actif) {
        throw new Error('Action refusée : tu ne peux pas te désactiver toi-même.');
      }

      await tx
        .update(utilisateurs)
        .set({
          roleId: parsed.data.roleId,
          actif: parsed.data.actif,
          updatedAt: new Date(),
        })
        .where(eq(utilisateurs.id, utilisateurId));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'utilisateurs',
        rowId: utilisateurId,
        before: { roleId: before.roleId, actif: before.actif },
        after: { roleId: parsed.data.roleId, actif: parsed.data.actif },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/utilisateurs`);
    revalidatePath(`/${ctx.entreprise.slug}/administration/utilisateurs/${utilisateurId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Mise à jour impossible.',
    };
  }
}

export async function assignerRole(
  utilisateurId: string,
  roleId: string,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const moi = ctx.utilisateur;
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select({ roleId: utilisateurs.roleId, actif: utilisateurs.actif })
        .from(utilisateurs)
        .where(eq(utilisateurs.id, utilisateurId))
        .limit(1);
      if (!before) throw new Error('Utilisateur introuvable.');

      const cibleEstSeulAdmin = await estSeulAdminActif(tx, utilisateurId);
      const nouveauRoleEstAdmin = await estRoleAdmin(tx, roleId);

      if (cibleEstSeulAdmin && !nouveauRoleEstAdmin) {
        throw new Error(
          'Action refusée : c\'est le dernier administrateur actif. Promouvoir un autre utilisateur admin d\'abord.',
        );
      }
      if (utilisateurId === moi.id && !nouveauRoleEstAdmin) {
        throw new Error('Action refusée : tu ne peux pas retirer ton propre rôle admin.');
      }

      await tx
        .update(utilisateurs)
        .set({ roleId, updatedAt: new Date() })
        .where(eq(utilisateurs.id, utilisateurId));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'utilisateurs',
        rowId: utilisateurId,
        before: { roleId: before.roleId },
        after: { roleId },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/utilisateurs`);
    revalidatePath(`/${ctx.entreprise.slug}/administration/utilisateurs/${utilisateurId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Changement de rôle impossible.',
    };
  }
}

export async function basculerActifUtilisateur(
  utilisateurId: string,
  actif: boolean,
): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const moi = ctx.utilisateur;
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select({ actif: utilisateurs.actif })
        .from(utilisateurs)
        .where(eq(utilisateurs.id, utilisateurId))
        .limit(1);
      if (!before) throw new Error('Utilisateur introuvable.');

      if (!actif) {
        if (utilisateurId === moi.id) {
          throw new Error('Action refusée : tu ne peux pas te désactiver toi-même.');
        }
        const cibleEstSeulAdmin = await estSeulAdminActif(tx, utilisateurId);
        if (cibleEstSeulAdmin) {
          throw new Error(
            'Action refusée : c\'est le dernier administrateur actif. Impossible de le désactiver.',
          );
        }
      }

      await tx
        .update(utilisateurs)
        .set({ actif, updatedAt: new Date() })
        .where(eq(utilisateurs.id, utilisateurId));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'utilisateurs',
        rowId: utilisateurId,
        before: { actif: before.actif },
        after: { actif },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/utilisateurs`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Modification impossible.',
    };
  }
}

export async function supprimerUtilisateur(utilisateurId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const moi = ctx.utilisateur;
  if (utilisateurId === moi.id) {
    return {
      ok: false,
      error: 'Action refusée : tu ne peux pas supprimer ton propre compte.',
    };
  }
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(utilisateurs)
        .where(eq(utilisateurs.id, utilisateurId))
        .limit(1);
      if (!before) throw new Error('Utilisateur introuvable.');
      if (before.deletedAt) {
        throw new Error('Utilisateur déjà supprimé.');
      }

      const cibleEstSeulAdmin = await estSeulAdminActif(tx, utilisateurId);
      if (cibleEstSeulAdmin) {
        throw new Error(
          'Action refusée : c\'est le dernier administrateur actif. Promouvoir un autre utilisateur admin d\'abord.',
        );
      }

      // Soft delete : on conserve la ligne pour traçabilité (audit, FK).
      // L'utilisateur est aussi marqué inactif pour bloquer toute session future.
      await tx
        .update(utilisateurs)
        .set({ deletedAt: new Date(), actif: false, updatedAt: new Date() })
        .where(eq(utilisateurs.id, utilisateurId));

      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'utilisateurs',
        rowId: utilisateurId,
        before: { actif: before.actif, deletedAt: before.deletedAt },
        after: { actif: false, deletedAt: new Date().toISOString() },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/utilisateurs`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Suppression impossible.',
    };
  }
}

export async function restaurerUtilisateur(utilisateurId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(utilisateurs)
        .where(and(eq(utilisateurs.id, utilisateurId), isNotNull(utilisateurs.deletedAt)))
        .limit(1);
      if (!before) throw new Error('Utilisateur introuvable ou non supprimé.');

      await tx
        .update(utilisateurs)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(utilisateurs.id, utilisateurId));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'utilisateurs',
        rowId: utilisateurId,
        before: { deletedAt: before.deletedAt },
        after: { deletedAt: null },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/administration/utilisateurs`);
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Restauration impossible.',
    };
  }
}
