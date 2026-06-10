import { withSentryConfig } from '@sentry/nextjs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Ancre Turbopack sur ce repo. Sans ça, Next remonte l'arborescence et peut
  // détecter un lockfile parent (ex : `C:\Users\<user>\package-lock.json`),
  // ce qui déclenche un warning et peut faire résoudre les modules au mauvais endroit.
  turbopack: {
    root: __dirname,
  },

  // Compression gzip côté serveur Next (active par défaut, on l'explicite).
  compress: true,

  // jsdom lit `default-stylesheet.css` via `__dirname` au runtime. Si Turbopack le
  // bundle, il fige `__dirname` en `/ROOT/...` (placeholder de compilation), ce qui
  // provoque `ENOENT: C:\ROOT\node_modules\...\default-stylesheet.css` sur Windows.
  // En l'externalisant, Next utilise le `require` Node natif qui résout le vrai chemin.
  //
  // Même motif pour la génération Factur-X (server-only) :
  //   - @react-pdf/renderer → fontkit lit les .ttf embarqués via fs.readFileSync ;
  //   - node-zugferd → pdf-lib + profil ICC sRGB lus depuis le disque.
  // Les bundler casse ces lectures (`__dirname` figé). Cf. mémoire « Turbopack & fs ».
  serverExternalPackages: ['isomorphic-dompurify', 'jsdom', '@react-pdf/renderer', 'node-zugferd'],

  // Lint & typecheck ne sont PAS rejoués pendant `next build` : ils tournent déjà
  // en étapes dédiées (lefthook pre-commit=eslint / pre-push=typecheck, + job CI
  // `check` qui lance `pnpm lint` et `pnpm typecheck` AVANT le build). Les refaire
  // ici doublait ~1 min de build pour zéro couverture supplémentaire.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // En-têtes de sécurité (OWASP ASVS niveau 2) + cache long pour les assets fingerprintés.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
      // Assets fingerprintés Next : immutables, jamais re-téléchargés par le navigateur.
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  experimental: {
    serverActions: {
      // Contrainte projet : fichiers jusqu'à 20 Mo (ADR, cf. pré-requis utilisateur)
      bodySizeLimit: '25mb',
    },
    // Tree-shake les libs lourdes : Next ne bundle que les icônes / SDK utilisés.
    // Le bundle initial passe de ~600 KB (lucide complet) à ~30 KB (icônes effectives).
    optimizePackageImports: [
      'lucide-react',
      '@aws-sdk/client-s3',
      '@aws-sdk/s3-request-presigner',
      'better-auth',
      '@sentry/nextjs',
      'date-fns',
      'recharts',
      'xlsx',
      'zod',
    ],
  },
};

// Wrap avec Sentry/GlitchTip uniquement si un DSN est fourni.
// Sans cette garde, le wrapper injecte de l'instrumentation Edge qui entre en
// conflit avec Turbopack sur Next 15 (`Cannot redefine property: __import_unsupported`).
// Doc : https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      sourcemaps: { disable: true },
    })
  : nextConfig;
