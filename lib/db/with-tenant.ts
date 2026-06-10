import 'server-only';

import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { db } from './client';

/**
 * Type de la transaction Drizzle passée au callback. Identique à `db.transaction`
 * mais explicité pour qu'on puisse typer les server actions qui le reçoivent.
 */
export type TenantTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Ouvre une transaction Drizzle, pose `app.current_entreprise_id` via SET LOCAL,
 * puis exécute le callback. La GUC est automatiquement levée à la fin de la
 * transaction (commit ou rollback) — pas de fuite entre requêtes HTTP.
 *
 * Toutes les server actions métier doivent passer par ce wrapper. Les requêtes
 * Drizzle effectuées via `tx` (et non `db` global) seront filtrées par la RLS
 * Postgres : `WHERE entreprise_id = current_setting('app.current_entreprise_id')`.
 *
 * @param entrepriseId UUID de l'entreprise active (obtenu via `requireTenantContext`).
 * @param fn Callback recevant la transaction. Les opérations Drizzle utilisées
 *           doivent être appelées sur `tx`, pas sur `db`.
 *
 * @example
 *   const articles = await withTenant(entrepriseId, (tx) =>
 *     tx.select().from(articles).where(isNull(articles.deletedAt))
 *   );
 */
export async function withTenant<T>(
  entrepriseId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // SET LOCAL → la GUC ne survit pas à la fin de la transaction.
    // On utilise set_config(name, value, is_local=true) en lieu et place de
    // `SET LOCAL` parce que la valeur est un paramètre lié (sécurité côté
    // postgres-js : pas d'interpolation textuelle).
    await tx.execute(sql`SELECT set_config('app.current_entreprise_id', ${entrepriseId}, true)`);
    return fn(tx);
  });
}

/**
 * Variante sans transaction explicite : ouvre une transaction, pose le GUC,
 * exécute la requête Drizzle simple et retourne le résultat. Utile pour les
 * SELECT à un seul appel quand on ne veut pas écrire le `tx => tx....`.
 *
 * @example
 *   const rows = await runInTenant(entrepriseId, (tx) =>
 *     tx.select().from(articles)
 *   );
 */
export const runInTenant = withTenant;

/**
 * Détecte si la base est configurée avec RLS active. Utilisé par les tests
 * d'intégration pour vérifier qu'aucun environnement de prod ne tournerait
 * sans la RLS posée (faux sentiment de sécurité).
 */
export async function assertRlsEnabled(tableName = 'articles'): Promise<void> {
  const [row] = (await db.execute(
    sql`SELECT rowsecurity::boolean AS enabled FROM pg_tables WHERE schemaname = 'public' AND tablename = ${tableName}`,
  )) as unknown as Array<{ enabled: boolean }>;
  if (!row || !row.enabled) {
    throw new Error(
      `RLS désactivée sur la table ${tableName}. Cela rend l'isolation multi-tenant inopérante.`,
    );
  }
}

/** Re-export pour les tests qui veulent typer leur fixture. */
export type { PostgresJsDatabase };
