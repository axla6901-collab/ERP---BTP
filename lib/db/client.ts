import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL est requis. Copier .env.example vers .env.local.');
}

/**
 * Pool postgres-js partagée via `globalThis` pour survivre aux rechargements
 * HMR du dev server Next.js. Sans ça, chaque hot-reload re-évalue ce module
 * et crée une nouvelle pool de 10 connexions, qui restent en `idle` jusqu'à
 * saturation du serveur (FATAL: "remaining connection slots are reserved").
 *
 * `max: 10` reste la valeur par défaut de postgres-js — c'est juste qu'on
 * garantit UNE seule pool par process. `idle_timeout: 30s` ferme les
 * connexions inutilisées pour ne pas accumuler durant les longues sessions
 * de dev.
 */
declare global {
  // eslint-disable-next-line no-var
  var __erpBtpDbClient: ReturnType<typeof postgres> | undefined;
}

const queryClient =
  globalThis.__erpBtpDbClient ??
  postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 10,
    idle_timeout: 30,
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__erpBtpDbClient = queryClient;
}

export const db = drizzle(queryClient, { casing: 'snake_case' });

// ---------------------------------------------------------------------------
// Pool super-admin (BYPASSRLS) — uniquement pour les opérations cross-tenant
// (provisioning d'entreprises, audit global, console super-admin).
//
// Connecté avec le rôle `app_admin` (cf. migration 0037a). Initialisé en lazy
// pour ne pas créer une connexion si l'env n'est pas configurée.
//
// ⚠️ N'EST JAMAIS À UTILISER pour le code métier d'un tenant. Réservé à
// `lib/admin/**` et aux migrations applicatives ponctuelles.
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __erpBtpDbAdminClient: ReturnType<typeof postgres> | undefined;
}

let _dbAdmin: ReturnType<typeof drizzle> | null = null;

export function getDbAdmin(): ReturnType<typeof drizzle> {
  if (_dbAdmin) return _dbAdmin;
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error(
      'DATABASE_ADMIN_URL est requis pour les opérations super-admin. ' +
        'Format attendu : postgresql://app_admin:<password>@host:5432/erpbtp',
    );
  }
  // Pool admin partagée via globalThis (cf. pool principale plus haut) pour
  // éviter l'accumulation HMR.
  const adminQueryClient =
    globalThis.__erpBtpDbAdminClient ??
    postgres(url, { prepare: false, max: 3, idle_timeout: 30 });
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__erpBtpDbAdminClient = adminQueryClient;
  }
  _dbAdmin = drizzle(adminQueryClient, { casing: 'snake_case' });
  return _dbAdmin;
}
