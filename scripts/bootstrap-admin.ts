/**
 * scripts/bootstrap-admin.ts
 *
 * Promeut un utilisateur existant en rôle `admin`.
 *
 * Usage :
 *   pnpm bootstrap:admin <email>
 *   tsx scripts/bootstrap-admin.ts <email>
 *
 * Le script utilise DATABASE_URL (app_rw) car la table `utilisateurs` est en DML.
 * Aucune création de compte ici — le compte doit déjà exister (provisionné par
 * la console super-admin lors de la création d'entreprise). L'auto-inscription
 * publique est désactivée (cf. emailAndPassword.disableSignUp dans lib/auth/server.ts).
 */

import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

config({ path: '.env.local' });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL absent. Copier .env.example vers .env.local.');
  process.exit(1);
}

const emailArg = process.argv[2];
if (!emailArg) {
  console.error('❌ Usage : pnpm bootstrap:admin <email>');
  process.exit(1);
}

async function main(email: string, dbUrl: string) {
  const { roles } = await import('@/db/schema/rbac');
  const { utilisateurs } = await import('@/db/schema/utilisateurs');

  const client = postgres(dbUrl, { prepare: false });
  const db = drizzle(client, { casing: 'snake_case' });

  try {
    const [roleAdmin] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'admin'))
      .limit(1);

    if (!roleAdmin) {
      console.error(
        '❌ Rôle "admin" introuvable en base. Migration 0021_rbac_granulaire appliquée ?',
      );
      process.exit(1);
    }

    const [existing] = await db
      .select({
        id: utilisateurs.id,
        email: utilisateurs.email,
        roleId: utilisateurs.roleId,
        actif: utilisateurs.actif,
      })
      .from(utilisateurs)
      .where(eq(utilisateurs.email, email))
      .limit(1);

    if (!existing) {
      console.error(`❌ Aucun compte avec l'email "${email}".`);
      console.error(
        "   Crée d'abord ce compte via la console super-admin (création d'entreprise).",
      );
      process.exit(1);
    }

    if (!existing.actif) {
      console.error(`❌ Le compte "${email}" est désactivé (utilisateurs.actif = false).`);
      console.error("   Réactive-le d'abord (cf. runbook user-management.md).");
      process.exit(1);
    }

    if (existing.roleId === roleAdmin.id) {
      console.log(`ℹ️  ${email} est déjà admin. Aucune action.`);
      process.exit(0);
    }

    await db
      .update(utilisateurs)
      .set({ roleId: roleAdmin.id, updatedAt: new Date() })
      .where(eq(utilisateurs.id, existing.id));

    console.log(`✅ ${email} promu admin.`);
    console.log('   La session active doit être renouvelée pour que le rôle soit reflété.');
  } finally {
    await client.end();
  }
}

main(emailArg, databaseUrl).catch((err) => {
  console.error('❌ Erreur inattendue :', err);
  process.exit(1);
});
