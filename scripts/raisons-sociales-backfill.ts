/**
 * Backfill du référentiel central des raisons sociales (migration 0072 → 0073).
 *
 * Usage :
 *   pnpm tsx scripts/raisons-sociales-backfill.ts            # exécute le backfill
 *   pnpm tsx scripts/raisons-sociales-backfill.ts --check    # vérifie seulement (lecture seule)
 *
 * À exécuter ENTRE 0072 (crée `raisons_sociales` + colonnes `raison_sociale_id`
 * NULLABLES) et 0073 (NOT NULL + drop des colonnes texte). Pour chaque entreprise :
 *   1. peuple `raisons_sociales` avec les noms distincts (insensible à la casse)
 *      issus de clients (pro) / fournisseurs / sous_traitants / societes ;
 *   2. rattache chaque ligne à son entrée de référentiel (raison_sociale_id).
 * Idempotent : ON CONFLICT DO NOTHING + n'écrit que les FK encore NULL.
 *
 * Rôle DB : app_admin (DATABASE_ADMIN_URL). app_migrator/app_rw sont soumis au
 * RLS (pas BYPASSRLS) → ils ne verraient pas les lignes des autres tenants.
 * Seul app_admin garantit un backfill exhaustif cross-tenant.
 *
 * Sortie : code 0 si toutes les lignes requises ont une FK, code 1 sinon
 * (gate avant d'appliquer 0073).
 */
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const CHECK_ONLY = process.argv.includes('--check');

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const url = process.env.DATABASE_ADMIN_URL;
if (!url) {
  fail(
    'DATABASE_ADMIN_URL est requis (rôle app_admin / BYPASSRLS). ' +
      'Format : postgresql://app_admin:<password>@host:5432/erpbtp',
  );
}

const sql = postgres(url, { prepare: false, max: 3 });

/**
 * Sources (table, colonne texte, filtre) alimentant le référentiel.
 * Les filtres `where` qualifient les colonnes par l'alias `t` : indispensable
 * car la table source est jointe à `raisons_sociales` (qui a aussi une colonne
 * `raison_sociale`) dans l'UPDATE de rattachement → sinon ambiguïté SQL.
 */
const SOURCES: ReadonlyArray<{ table: string; col: string; where: string }> = [
  {
    table: 'clients',
    col: 'raison_sociale',
    where: "t.type = 'professionnel' AND t.raison_sociale IS NOT NULL",
  },
  { table: 'fournisseurs', col: 'nom', where: 't.nom IS NOT NULL' },
  { table: 'sous_traitants', col: 'nom', where: 't.nom IS NOT NULL' },
  { table: 'societes', col: 'raison_sociale', where: 't.raison_sociale IS NOT NULL' },
];

/** Peuple raisons_sociales avec les noms distincts (case-insensitive) par entreprise. */
async function peuplerReferentiel(): Promise<number> {
  const unions = SOURCES.map(
    (s) => `SELECT t.entreprise_id, btrim(t.${s.col}) AS nm FROM ${s.table} t WHERE ${s.where}`,
  ).join(' UNION ALL ');

  const inserted = await sql.unsafe(`
    INSERT INTO raisons_sociales (entreprise_id, raison_sociale)
    SELECT DISTINCT ON (entreprise_id, lower(nm)) entreprise_id, nm
    FROM ( ${unions} ) s
    WHERE char_length(btrim(nm)) BETWEEN 2 AND 200
    ORDER BY entreprise_id, lower(nm)
    ON CONFLICT (entreprise_id, lower(raison_sociale)) WHERE deleted_at IS NULL DO NOTHING
  `);
  return inserted.count ?? 0;
}

/** Rattache une table source à son entrée de référentiel (FK encore NULL only). */
async function rattacher(table: string, col: string, where: string): Promise<number> {
  const res = await sql.unsafe(`
    UPDATE ${table} t
    SET raison_sociale_id = rs.id
    FROM raisons_sociales rs
    WHERE rs.entreprise_id = t.entreprise_id
      AND rs.deleted_at IS NULL
      AND lower(rs.raison_sociale) = lower(btrim(t.${col}))
      AND t.raison_sociale_id IS NULL
      AND (${where})
  `);
  return res.count ?? 0;
}

/** Compte les lignes qui DOIVENT avoir une FK mais ne l'ont pas encore. */
async function compterManquants(): Promise<number> {
  const checks: ReadonlyArray<{ label: string; query: string }> = [
    {
      label: 'fournisseurs',
      query: 'SELECT count(*)::int AS n FROM fournisseurs WHERE raison_sociale_id IS NULL',
    },
    {
      label: 'sous_traitants',
      query: 'SELECT count(*)::int AS n FROM sous_traitants WHERE raison_sociale_id IS NULL',
    },
    {
      label: 'societes',
      query: 'SELECT count(*)::int AS n FROM societes WHERE raison_sociale_id IS NULL',
    },
    {
      label: 'clients (pro)',
      query:
        "SELECT count(*)::int AS n FROM clients WHERE type = 'professionnel' AND raison_sociale_id IS NULL",
    },
  ];
  let total = 0;
  for (const c of checks) {
    const [row] = await sql.unsafe(c.query);
    const n = (row?.n as number) ?? 0;
    if (n > 0) {
      total += n;
      console.warn(`  ! ${c.label} : ${n} ligne(s) sans raison_sociale_id`);
    }
  }
  return total;
}

async function main(): Promise<void> {
  console.log(
    CHECK_ONLY
      ? '🔎 Vérification du rattachement des raisons sociales (lecture seule)'
      : '🏷️  Backfill du référentiel des raisons sociales',
  );

  if (!CHECK_ONLY) {
    const nbCrees = await peuplerReferentiel();
    console.log(`  · référentiel : ${nbCrees} raison(s) sociale(s) créée(s)`);
    for (const { table, col, where } of SOURCES) {
      const n = await rattacher(table, col, where);
      console.log(`  · ${table} : ${n} ligne(s) rattachée(s)`);
    }
  }

  const manquants = await compterManquants();
  await sql.end({ timeout: 5 });

  if (manquants > 0) {
    fail(
      `${manquants} ligne(s) sans raison_sociale_id — NE PAS appliquer 0073. ` +
        'Relancer le backfill (sans --check).',
    );
  }
  console.log('✓ 0 ligne sans raison_sociale_id — 0073 peut être appliquée.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
