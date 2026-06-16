import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';

/**
 * Config ESLint « flat » (eslint 9). Remplace `.eslintrc.json` + `next lint`.
 *
 * `next lint` est déprécié (Next 16) et plante en CI (Node 22) avec
 * « Converting circular structure to JSON » lors de la sérialisation de la
 * config eslintrc (objet circulaire d'eslint-plugin-react). On lance donc
 * `eslint .` directement : pas de chemin de sérialisation buggé, et un résultat
 * déterministe quelle que soit la version de Node.
 *
 * Le contenu reproduit fidèlement l'ancien `.eslintrc.json` via `FlatCompat`
 * (extends `next/core-web-vitals` + `next/typescript`, mêmes règles + overrides).
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

const eslintConfig = [
  {
    // Parité avec l'ancien `.eslintrc.json` : eslint 9 (flat) active par défaut
    // le signalement des directives `eslint-disable` inutilisées, pas l'eslintrc.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'maquettes/**',
      '**/*.config.{js,cjs,mjs,ts}',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/lib/db/client',
              importNames: ['db', 'getDbAdmin'],
              message:
                "Les server actions métier doivent utiliser `withTenant(entrepriseId, tx => ...)` depuis `@/lib/db/with-tenant`. L'import direct de `db` ou `getDbAdmin` est réservé à lib/db/**, lib/auth/**, lib/admin/** (cf. plan multi-tenant).",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'lib/db/**/*.ts',
      'lib/auth/**/*.ts',
      'lib/admin/**/*.ts',
      'lib/audit/**/*.ts',
      'scripts/**/*.{ts,mts,cts}',
      'tests/**/*.{ts,tsx}',
      'app/api/admin/**/*.ts',
      'app/api/entreprise/**/*.ts',
      '**/*-super.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Scripts CLI (seed, bootstrap, smoke…) : la sortie console est leur raison d'être.
    files: ['scripts/**/*.{ts,mts,cts,js,mjs,cjs}'],
    rules: { 'no-console': 'off' },
  },
  {
    // Tests : les règles « pages Next » ne s'appliquent pas (faux positifs sur
    // un `<a>` de fixture), et les logs de debug sont tolérés.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
      'no-console': 'off',
    },
  },
];

export default eslintConfig;
