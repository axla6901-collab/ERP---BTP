// Sentry client init (chargé dans le navigateur).
// Compatible GlitchTip (clone open-source de Sentry) — il suffit de pointer
// NEXT_PUBLIC_SENTRY_DSN vers une instance GlitchTip locale ou auto-hébergée.
// Si la variable est vide, le SDK ne fait rien (no-op).

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // Pas de session replay côté client par défaut (privacy)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
  });
}
