import 'server-only';

import { sql } from 'drizzle-orm';

import { getDbAdmin, type db } from '@/lib/db/client';
import { auditLog } from '@/db/schema/audit';

import { getSession } from '@/lib/auth/guards';
import { caviarderChampsSensibles } from './redaction';

type AuditAction = 'insert' | 'update' | 'delete';

type AuditLogParams = {
  action: AuditAction;
  tableName: string;
  rowId: string;
  before?: unknown;
  after?: unknown;
  /**
   * Override de l'utilisateur (par défaut : extrait de la session courante).
   * Utile pour les batch jobs / Server Actions sans cookie de session.
   */
  utilisateurId?: string | null;
};

/**
 * Trace une mutation métier dans `audit_log`.
 *
 * À appeler depuis les Server Actions / route handlers, idéalement DANS la même
 * transaction Drizzle que la mutation elle-même (sinon une mutation réussie
 * peut être tracée sans audit en cas de crash entre les deux).
 *
 * Exemple :
 *   await db.transaction(async (tx) => {
 *     const [before] = await tx.select().from(clients).where(eq(clients.id, id));
 *     await tx.update(clients).set(values).where(eq(clients.id, id));
 *     await auditLogIn(tx, { action: 'update', tableName: 'clients', rowId: id, before, after: values });
 *   });
 */
export async function auditLogEvent(params: AuditLogParams): Promise<void> {
  const utilisateurId =
    params.utilisateurId !== undefined ? params.utilisateurId : await currentUserId();

  // Path super-admin (cf. 0043_rls_policies.sql §4) : entreprise_id NULL est
  // réservé aux actions cross-tenant et n'est insérable que via un rôle
  // BYPASSRLS. On passe donc par la pool admin, pas par `db` (app_rw) qui
  // serait bloqué par la policy p_tenant.
  await getDbAdmin()
    .insert(auditLog)
    .values({
      entrepriseId: null,
      action: params.action,
      tableName: params.tableName,
      rowId: params.rowId,
      before: caviarderChampsSensibles(params.tableName, params.before) ?? null,
      after: caviarderChampsSensibles(params.tableName, params.after) ?? null,
      utilisateurId,
    });
}

/**
 * Variante transactionnelle : exécute l'INSERT dans la transaction fournie.
 * Préférer celle-ci quand on enchaîne plusieurs mutations.
 */
export async function auditLogIn(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: AuditLogParams,
): Promise<void> {
  const utilisateurId =
    params.utilisateurId !== undefined ? params.utilisateurId : await currentUserId();

  // entreprise_id est requis par la policy RLS p_tenant (0043_rls_policies.sql).
  // On lit la GUC posée par withTenant() plutôt que de la propager via signature
  // pour ne pas toucher les 25+ call sites.
  await tx.insert(auditLog).values({
    entrepriseId: sql`current_setting('app.current_entreprise_id', true)::uuid`,
    action: params.action,
    tableName: params.tableName,
    rowId: params.rowId,
    before: caviarderChampsSensibles(params.tableName, params.before) ?? null,
    after: caviarderChampsSensibles(params.tableName, params.after) ?? null,
    utilisateurId,
  });
}

async function currentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}
