/**
 * Test d'intégration de la Row Level Security PostgreSQL.
 *
 * Vérifie que l'isolation multi-tenant est effective au niveau base : un
 * client `app_rw` qui pose un GUC `app.current_entreprise_id` ne voit que
 * les lignes de son tenant et ne peut pas en créer ailleurs.
 *
 * **Requiert** une base Postgres réelle (le mock ne supporte pas RLS) avec
 * les rôles `app_rw` (soumis à RLS) et `app_admin` (BYPASSRLS pour seed).
 *
 * Lancement :
 *
 *   RUN_INTEGRATION_TESTS=true \
 *   DATABASE_URL=postgresql://app_rw:app_rw_dev_password@localhost:5432/erpbtp \
 *   DATABASE_ADMIN_URL=postgresql://app_admin:app_admin_dev_password@localhost:5432/erpbtp \
 *   pnpm vitest run tests/integration
 *
 * Skippé par défaut si `RUN_INTEGRATION_TESTS` ≠ "true".
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const SHOULD_RUN =
  process.env.RUN_INTEGRATION_TESTS === 'true' || process.env.RUN_INTEGRATION_TESTS === '1';
const RW_URL = process.env.DATABASE_URL;
const ADMIN_URL = process.env.DATABASE_ADMIN_URL;

// Connexions partagées par les tests du fichier.
// sqlAdmin = app_admin BYPASSRLS (pour seed/teardown cross-tenant)
// sqlRw = app_rw soumis à RLS (sujet des tests)
let sqlAdmin: ReturnType<typeof postgres> | null = null;
let sqlRw: ReturnType<typeof postgres> | null = null;
let entrepriseA = '';
let entrepriseB = '';
let canRun = false;

const SLUG_A = `rls-a-${Date.now()}`;
const SLUG_B = `rls-b-${Date.now()}`;

beforeAll(async () => {
  if (!SHOULD_RUN) {
    console.warn(
      '[rls.test] RUN_INTEGRATION_TESTS!=true — tests d\'intégration skippés ' +
        '(set RUN_INTEGRATION_TESTS=true pour les activer).',
    );
    return;
  }
  if (!RW_URL || !ADMIN_URL) {
    console.warn(
      '[rls.test] DATABASE_URL ou DATABASE_ADMIN_URL absents — tests skippés. ' +
        'Consulter le header du fichier pour la commande complète.',
    );
    return;
  }
  try {
    sqlAdmin = postgres(ADMIN_URL, { prepare: false, max: 2 });
    sqlRw = postgres(RW_URL, { prepare: false, max: 2 });

    // Seed deux entreprises via app_admin (BYPASSRLS)
    const [a] = await sqlAdmin<{ id: string }[]>`
      INSERT INTO entreprises (slug, raison_sociale)
      VALUES (${SLUG_A}, 'RLS Test A')
      RETURNING id
    `;
    const [b] = await sqlAdmin<{ id: string }[]>`
      INSERT INTO entreprises (slug, raison_sociale)
      VALUES (${SLUG_B}, 'RLS Test B')
      RETURNING id
    `;
    entrepriseA = a!.id;
    entrepriseB = b!.id;

    // Une famille dans chaque entreprise (table racine catalogue)
    await sqlAdmin`
      INSERT INTO familles (entreprise_id, code, libelle)
      VALUES (${entrepriseA}, 'RLS-A', 'Famille A'), (${entrepriseB}, 'RLS-B', 'Famille B')
    `;
    canRun = true;
  } catch (err) {
    console.warn('[rls.test] Connexion DB impossible, tests skippés :', err);
    canRun = false;
  }
});

afterAll(async () => {
  if (!sqlAdmin) return;
  try {
    if (entrepriseA && entrepriseB) {
      await sqlAdmin`
        DELETE FROM familles WHERE entreprise_id IN (${entrepriseA}, ${entrepriseB})
      `;
      await sqlAdmin`
        DELETE FROM entreprises WHERE id IN (${entrepriseA}, ${entrepriseB})
      `;
    }
  } finally {
    await sqlAdmin.end({ timeout: 2 });
    if (sqlRw) await sqlRw.end({ timeout: 2 });
  }
});

describe('Row Level Security multi-tenant', () => {
  it('SELECT sans GUC retourne 0 lignes (fail-closed)', async () => {
    if (!canRun || !sqlRw) {
      console.warn('Skip : pas de DB');
      return;
    }
    // Pas de SET LOCAL → la policy bloque tout
    const rows = await sqlRw`SELECT count(*)::int AS n FROM familles WHERE code IN ('RLS-A', 'RLS-B')`;
    expect(rows[0]?.n).toBe(0);
  });

  it('SELECT avec GUC tenant A ne voit que la famille A', async () => {
    if (!canRun || !sqlRw) return;
    await sqlRw.begin(async (tx) => {
      await tx`SELECT set_config('app.current_entreprise_id', ${entrepriseA}, true)`;
      const rows = await tx<{ code: string }[]>`
        SELECT code FROM familles WHERE code IN ('RLS-A', 'RLS-B')
      `;
      expect(rows.map((r) => r.code).sort()).toEqual(['RLS-A']);
    });
  });

  it('SELECT avec GUC tenant B ne voit que la famille B', async () => {
    if (!canRun || !sqlRw) return;
    await sqlRw.begin(async (tx) => {
      await tx`SELECT set_config('app.current_entreprise_id', ${entrepriseB}, true)`;
      const rows = await tx<{ code: string }[]>`
        SELECT code FROM familles WHERE code IN ('RLS-A', 'RLS-B')
      `;
      expect(rows.map((r) => r.code).sort()).toEqual(['RLS-B']);
    });
  });

  it('INSERT avec entreprise_id forgé (autre tenant) est rejeté par WITH CHECK', async () => {
    if (!canRun || !sqlRw) return;
    let caught: unknown = null;
    try {
      await sqlRw.begin(async (tx) => {
        await tx`SELECT set_config('app.current_entreprise_id', ${entrepriseB}, true)`;
        // On essaye d'insérer dans le tenant A alors qu'on est en contexte B
        await tx`
          INSERT INTO familles (entreprise_id, code, libelle)
          VALUES (${entrepriseA}, 'HACK', 'Hack')
        `;
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeTruthy();
    expect(String(caught)).toMatch(/row-level security|policy/i);
  });

  it('INSERT avec entreprise_id cohérent (même tenant) fonctionne', async () => {
    if (!canRun || !sqlRw) return;
    await sqlRw.begin(async (tx) => {
      await tx`SELECT set_config('app.current_entreprise_id', ${entrepriseA}, true)`;
      await tx`
        INSERT INTO familles (entreprise_id, code, libelle)
        VALUES (${entrepriseA}, 'RLS-A2', 'Famille A bis')
      `;
      const rows = await tx<{ code: string }[]>`
        SELECT code FROM familles WHERE code LIKE 'RLS-A%'
      `;
      expect(rows.map((r) => r.code).sort()).toEqual(['RLS-A', 'RLS-A2']);
    });
    // Cleanup avant les tests suivants
    if (sqlAdmin)
      await sqlAdmin`DELETE FROM familles WHERE code = 'RLS-A2' AND entreprise_id = ${entrepriseA}`;
  });

  it('toutes les policies p_tenant sont posées sur les tables scopées', async () => {
    if (!canRun || !sqlAdmin) return;
    const expectedTables = [
      'articles',
      'familles',
      'fournisseurs',
      'clients',
      'devis',
      'lignes_devis',
      'factures',
      'chantiers',
      'employes',
      'pointages',
      'sous_traitants',
      'situations_travaux',
      'numeros_attribues',
      'audit_log',
    ];
    const rows = await sqlAdmin<{ tablename: string }[]>`
      SELECT tablename FROM pg_policies
      WHERE schemaname = 'public' AND policyname = 'p_tenant'
    `;
    const present = new Set(rows.map((r) => r.tablename));
    for (const t of expectedTables) {
      expect(present.has(t), `policy p_tenant manquante sur ${t}`).toBe(true);
    }
  });
});
