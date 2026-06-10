import type { MetadataRoute } from 'next';

/**
 * Manifest PWA (M5.5). Next génère `/manifest.webmanifest` et injecte
 * automatiquement `<link rel="manifest">`. Le matcher du middleware exclut cette
 * route (et `/icons/...`) pour qu'elle soit servie même sans session — sinon
 * l'installation de la PWA et l'écran de login échouent à charger le manifest.
 *
 * `start_url` = `/` : à l'ouverture, le middleware redirige vers l'entreprise
 * active (cookie) ou `/select-entreprise`. La saisie terrain reste sous
 * `/<slug>/rh/pointages/terrain` (préfixée par tenant).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ERP BTP — Bâtiment',
    short_name: 'ERP BTP',
    description: 'ERP Bâtiment — gestion et pointage chantier hors-ligne.',
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#fafafa',
    theme_color: '#f59e0b',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
