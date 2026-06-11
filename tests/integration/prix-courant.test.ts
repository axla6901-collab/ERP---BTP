/**
 * Test d'intégration de l'ordre de priorité de `prix_courant_article()`.
 *
 * Vérifie la règle métier revue le 2026-06-10 (cf. migration 0067, qui inverse
 * 0061) : le prix de référence générique (fournisseur_id IS NULL) est le PRIX
 * RETENU dès qu'il est renseigné — il prime sur tous les prix fournisseurs
 * (grilles, préféré, moins-disant). Les prix fournisseurs ne servent que de
 * repli quand AUCUNE référence n'existe ; entre eux, le fournisseur « préféré »
 * passe devant l'auto-moins-cher. Seule la grille rattachée à un chantier
 * (passée en 3ᵉ argument) reste au-dessus de la référence.
 *
 * **Requiert** une base Postgres réelle (la fonction est SECURITY DEFINER et
 * dépend du schéma). On seed/teardown via `app_admin` (BYPASSRLS).
 *
 * Lancement :
 *
 *   RUN_INTEGRATION_TESTS=true \
 *   DATABASE_ADMIN_URL=postgresql://app_admin:app_admin_dev_password@localhost:5432/erpbtp \
 *   pnpm vitest run tests/integration
 *
 * Skippé par défaut si `RUN_INTEGRATION_TESTS` ≠ "true".
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const SHOULD_RUN =
  process.env.RUN_INTEGRATION_TESTS === 'true' || process.env.RUN_INTEGRATION_TESTS === '1';
const ADMIN_URL = process.env.DATABASE_ADMIN_URL;

let sql: ReturnType<typeof postgres> | null = null;
let canRun = false;

const SLUG = `prixcourant-${Date.now()}`;
let entrepriseId = '';
let uniteId = '';
let fournisseurId = '';
let artRefOnly = '';
let artSupplier = '';
let artSupplierNoRef = '';

// Prix de validité ancienne pour garantir valid_from <= CURRENT_DATE.
const VALID_FROM = '2020-01-01';

type PrixRow = { prix: string; source: string };

beforeAll(async () => {
  if (!SHOULD_RUN) {
    console.warn(
      '[prix-courant.test] RUN_INTEGRATION_TESTS!=true — skippé ' +
        '(set RUN_INTEGRATION_TESTS=true pour activer).',
    );
    return;
  }
  if (!ADMIN_URL) {
    console.warn('[prix-courant.test] DATABASE_ADMIN_URL absent — skippé.');
    return;
  }
  try {
    sql = postgres(ADMIN_URL, { prepare: false, max: 2 });

    const [u] = await sql<{ id: string }[]>`
      SELECT id FROM unites WHERE actif = TRUE ORDER BY code LIMIT 1
    `;
    if (!u) {
      console.warn('[prix-courant.test] Aucune unité active en base — skippé.');
      return;
    }
    uniteId = u.id;

    const [e] = await sql<{ id: string }[]>`
      INSERT INTO entreprises (slug, raison_sociale)
      VALUES (${SLUG}, 'Prix Courant Test') RETURNING id
    `;
    entrepriseId = e!.id;

    const [f] = await sql<{ id: string }[]>`
      INSERT INTO familles (entreprise_id, code, libelle)
      VALUES (${entrepriseId}, 'PC-FAM', 'Famille test prix') RETURNING id
    `;
    const familleId = f!.id;

    const [four] = await sql<{ id: string }[]>`
      INSERT INTO fournisseurs (entreprise_id, code, nom, pays, actif)
      VALUES (${entrepriseId}, 'PC-FOUR', 'Fournisseur test', 'FR', TRUE) RETURNING id
    `;
    fournisseurId = four!.id;

    const [a1] = await sql<{ id: string }[]>`
      INSERT INTO articles (entreprise_id, code, libelle, famille_id, type, actif, favori)
      VALUES (${entrepriseId}, 'PC-REF', 'Réf seule', ${familleId}, 'simple', TRUE, FALSE)
      RETURNING id
    `;
    artRefOnly = a1!.id;

    const [a2] = await sql<{ id: string }[]>`
      INSERT INTO articles (entreprise_id, code, libelle, famille_id, type, actif, favori)
      VALUES (${entrepriseId}, 'PC-SUPP', 'Réf + fournisseur', ${familleId}, 'simple', TRUE, FALSE)
      RETURNING id
    `;
    artSupplier = a2!.id;

    const [a3] = await sql<{ id: string }[]>`
      INSERT INTO articles (entreprise_id, code, libelle, famille_id, type, actif, favori)
      VALUES (${entrepriseId}, 'PC-SUPP-NOREF', 'Fournisseur sans réf', ${familleId}, 'simple', TRUE, FALSE)
      RETURNING id
    `;
    artSupplierNoRef = a3!.id;

    // artRefOnly : uniquement un prix de référence (5,00).
    await sql`
      INSERT INTO prix_articles (entreprise_id, article_id, prix_unitaire_ht, unite_id, fournisseur_id, valid_from)
      VALUES (${entrepriseId}, ${artRefOnly}, 5.00, ${uniteId}, NULL, ${VALID_FROM})
    `;
    // artSupplier : prix de référence (5,00) ET prix fournisseur (7,00, NON préféré).
    await sql`
      INSERT INTO prix_articles (entreprise_id, article_id, prix_unitaire_ht, unite_id, fournisseur_id, valid_from)
      VALUES
        (${entrepriseId}, ${artSupplier}, 5.00, ${uniteId}, NULL, ${VALID_FROM}),
        (${entrepriseId}, ${artSupplier}, 7.00, ${uniteId}, ${fournisseurId}, ${VALID_FROM})
    `;
    // artSupplierNoRef : uniquement un prix fournisseur (7,00), AUCUNE référence.
    await sql`
      INSERT INTO prix_articles (entreprise_id, article_id, prix_unitaire_ht, unite_id, fournisseur_id, valid_from)
      VALUES (${entrepriseId}, ${artSupplierNoRef}, 7.00, ${uniteId}, ${fournisseurId}, ${VALID_FROM})
    `;

    canRun = true;
  } catch (err) {
    console.warn('[prix-courant.test] Connexion/seed DB impossible, skippé :', err);
    canRun = false;
  }
});

afterAll(async () => {
  if (!sql) return;
  try {
    if (entrepriseId) {
      // prix_articles est en CASCADE sur articles ; on supprime dans l'ordre FK.
      await sql`DELETE FROM prix_articles WHERE entreprise_id = ${entrepriseId}`;
      await sql`DELETE FROM articles WHERE entreprise_id = ${entrepriseId}`;
      await sql`DELETE FROM fournisseurs WHERE entreprise_id = ${entrepriseId}`;
      await sql`DELETE FROM familles WHERE entreprise_id = ${entrepriseId}`;
      await sql`DELETE FROM entreprises WHERE id = ${entrepriseId}`;
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
});

describe('prix_courant_article — ordre de priorité (migration 0067)', () => {
  it("le prix de référence l'emporte sur un prix fournisseur (non-préféré)", async () => {
    if (!canRun || !sql) {
      console.warn('Skip : pas de DB');
      return;
    }
    const rows = await sql<PrixRow[]>`
      SELECT prix::text, source FROM prix_courant_article(${artSupplier}, CURRENT_DATE)
    `;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.prix)).toBe(5.0);
    expect(rows[0]!.source).toBe('reference');
  });

  it('le prix de référence est aussi retenu quand il est la seule source', async () => {
    if (!canRun || !sql) return;
    const rows = await sql<PrixRow[]>`
      SELECT prix::text, source FROM prix_courant_article(${artRefOnly}, CURRENT_DATE)
    `;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.prix)).toBe(5.0);
    expect(rows[0]!.source).toBe('reference');
  });

  it("le prix de référence l'emporte même sur un fournisseur marqué préféré", async () => {
    if (!canRun || !sql) return;
    await sql`UPDATE articles SET fournisseur_prefere_id = ${fournisseurId} WHERE id = ${artSupplier}`;
    try {
      const rows = await sql<PrixRow[]>`
        SELECT prix::text, source FROM prix_courant_article(${artSupplier}, CURRENT_DATE)
      `;
      expect(rows).toHaveLength(1);
      expect(Number(rows[0]!.prix)).toBe(5.0);
      expect(rows[0]!.source).toBe('reference');
    } finally {
      await sql`UPDATE articles SET fournisseur_prefere_id = NULL WHERE id = ${artSupplier}`;
    }
  });

  it('sans référence, le prix fournisseur sert de repli', async () => {
    if (!canRun || !sql) return;
    const rows = await sql<PrixRow[]>`
      SELECT prix::text, source FROM prix_courant_article(${artSupplierNoRef}, CURRENT_DATE)
    `;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.prix)).toBe(7.0);
    expect(rows[0]!.source).toBe('mini_fournisseur');
  });
});
