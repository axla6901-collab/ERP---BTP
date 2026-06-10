import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: [
      'tests/unit/**/*.test.ts',
      'tests/unit/**/*.test.tsx',
      'tests/integration/**/*.test.ts',
      'lib/**/*.test.ts',
      'lib/**/*.test.tsx',
    ],
    // Les tests d'intégration sont chargés mais ne s'exécutent que si
    // RUN_INTEGRATION_TESTS=true (gate explicite — cf. tests/integration/*.test.ts).
    exclude: ['node_modules', '.next', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'tests/**',
        'db/migrations/**',
        '**/*.config.*',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // server-only est un marqueur Next.js (RSC). En test il n'apporte rien,
      // on le stubble en module vide pour pouvoir importer les fichiers serveur.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
