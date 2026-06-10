/**
 * Backfill du chiffrement des champs sensibles (audit sécurité B1).
 *
 * Usage :
 *   pnpm tsx scripts/encrypt-sensitive-backfill.ts            # exécute le backfill
 *   pnpm tsx scripts/encrypt-sensitive-backfill.ts --check    # vérifie seulement (lecture seule)
 *
 * À exécuter ENTRE la migration 0067 (ajoute les colonnes `*_enc`) et 0068
 * (supprime le clair + renomme). Pour chaque colonne sensible, lit le clair,
 * chiffre via lib/crypto, écrit le bytea dans la colonne `*_enc`. Idempotent :
 * ne traite que les lignes dont `*_enc IS NULL` (relance sûre).
 *
 * Rôle DB : app_admin (DATABASE_ADMIN_URL). app_migrator/app_rw sont soumis au
 * RLS (pas BYPASSRLS) → ils ne verraient pas les lignes des autres tenants.
 * Seul app_admin garantit un backfill exhaustif cross-tenant.
 *
 * Sortie : code 0 si toutes les valeurs sont chiffrées, code 1 s'il reste du
 * clair (gate avant d'appliquer 0068). Clés via DATA_ENCRYPTION_KEYS.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

import { encryptField, isEncryptionConfigured } from '@/lib/crypto/encryption';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const CHECK_ONLY = process.argv.includes('--check');
const BATCH = 500;

/** Colonnes à chiffrer : (clair) `col` → (chiffré) `col_enc`. */
const TARGETS: ReadonlyArray<{ table: string; columns: readonly string[] }> = [
  {
    table: 'employes',
    columns: ['numero_secu', 'iban', 'bic', 'salaire_mensuel_brut', 'taux_horaire_brut'],
  },
  { table: 'entreprises', columns: ['iban', 'bic'] },
];

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!isEncryptionConfigured()) {
  fail(
    'DATA_ENCRYPTION_KEYS / DATA_ENCRYPTION_ACTIVE_KEY_ID absents ou invalides. ' +
      'Générer une clé : node scripts/generate-encryption-key.mjs',
  );
}

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  fail(
    'DATABASE_ADMIN_URL est requis (rôle app_admin / BYPASSRLS). ' +
      'Format : postgresql://app_admin:<password>@host:5432/erpbtp',
  );
}

const sql = postgres(url, { prepare: false, max: 3 });
// drizzle non utilisé ici (requêtes brutes sur colonnes temporaires) mais on
// garde l'import cohérent avec les autres scripts si extension future.
void drizzle;

/** Nombre de valeurs en clair non encore chiffrées pour une colonne. */
async function countRemaining(table: string, col: string): Promise<number> {
  const [row] = await sql`
    SELECT count(*)::int AS n
    FROM ${sql(table)}
    WHERE ${sql(col)} IS NOT NULL AND ${sql(`${col}_enc`)} IS NULL
  `;
  return (row?.n as number) ?? 0;
}

/** Chiffre une colonne par lots ; renvoie le nombre de valeurs chiffrées. */
async function encryptColumn(table: string, col: string): Promise<number> {
  const encCol = `${col}_enc`;
  let total = 0;
  for (;;) {
    const rows = await sql`
      SELECT id, ${sql(col)} AS val
      FROM ${sql(table)}
      WHERE ${sql(col)} IS NOT NULL AND ${sql(encCol)} IS NULL
      LIMIT ${BATCH}
    `;
    if (rows.length === 0) break;

    for (const row of rows) {
      const cipher = encryptField(String(row.val));
      await sql`
        UPDATE ${sql(table)}
        SET ${sql(encCol)} = ${cipher}
        WHERE id = ${row.id as string} AND ${sql(encCol)} IS NULL
      `;
    }
    total += rows.length;
    console.log(`  … ${table}.${col} : ${total} chiffré(s)`);
    if (rows.length < BATCH) break;
  }
  return total;
}

async function main(): Promise<void> {
  console.log(
    CHECK_ONLY
      ? '🔎 Vérification du chiffrement des champs sensibles (lecture seule)'
      : '🔐 Backfill du chiffrement des champs sensibles',
  );

  if (!CHECK_ONLY) {
    for (const { table, columns } of TARGETS) {
      for (const col of columns) {
        const n = await encryptColumn(table, col);
        if (n === 0) console.log(`  · ${table}.${col} : rien à faire`);
      }
    }
  }

  // Vérification finale : aucune valeur en clair ne doit rester sans chiffré.
  let remaining = 0;
  for (const { table, columns } of TARGETS) {
    for (const col of columns) {
      const n = await countRemaining(table, col);
      if (n > 0) {
        remaining += n;
        console.warn(`  ! ${table}.${col} : ${n} valeur(s) en clair NON chiffrée(s)`);
      }
    }
  }

  await sql.end({ timeout: 5 });

  if (remaining > 0) {
    fail(
      `${remaining} valeur(s) en clair restante(s) — NE PAS appliquer 0068. ` +
        'Relancer le backfill (sans --check).',
    );
  }
  console.log('✓ 0 valeur en clair restante — 0068 peut être appliquée.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
