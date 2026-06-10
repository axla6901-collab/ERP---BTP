import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env.local' });

if (!process.env.DATABASE_MIGRATOR_URL && !process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_MIGRATOR_URL (ou DATABASE_URL en dev) est requis pour Drizzle. ' +
      'Copier .env.example vers .env.local et remplir la valeur.',
  );
}

export default defineConfig({
  schema: './db/schema/*.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
  casing: 'snake_case',
});
