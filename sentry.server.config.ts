// Sentry server init (chargé côté Node.js, Server Components, Server Actions).
// Compatible GlitchTip. DSN vide = no-op.

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
  });
}
