import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

import { NavigationProgress } from '@/components/layout/navigation-progress';
import { ServiceWorkerRegistrar } from '@/lib/pwa/sw-register';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';

import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

// CSP à nonce (cf. `middleware.ts` + `lib/security/csp.ts`) : le nonce est
// régénéré à CHAQUE requête. Une page prégénérée en statique servirait un HTML
// figé sans ce nonce runtime → ses <script> seraient bloqués par
// `script-src 'nonce-…' 'strict-dynamic'`. On force donc le rendu dynamique de
// toutes les pages (l'app est entièrement derrière auth : aucune ne bénéficie
// du prérendu statique). Sans ça, /login, /reset-password, etc. (statiques)
// casseraient en production.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ERP BTP',
  description: 'ERP Bâtiment — PME BTP France',
  robots: { index: false, follow: false },
  // PWA (M5.5) : `app/manifest.ts` injecte automatiquement <link rel="manifest">.
  applicationName: 'ERP BTP',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ERP BTP',
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon.svg' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#f59e0b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={cn('font-sans', inter.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <NavigationProgress />
        <ServiceWorkerRegistrar />
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
