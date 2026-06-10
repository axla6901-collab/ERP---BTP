'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import { flushOutbox } from './outbox';

/** Registration enrichie du Background Sync (non typé par lib.dom standard). */
type RegistrationWithSync = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

/**
 * Enregistre le service worker (M5.5) et gère :
 *  - la bannière « Nouvelle version disponible » (skipWaiting contrôlé),
 *  - le rechargement à la prise de contrôle du nouveau SW,
 *  - une tentative de flush de l'outbox au chargement + à chaque retour réseau
 *    (filet de sécurité iOS, où le Background Sync du SW n'existe pas).
 *
 * SW **en production uniquement** : en dev (Turbopack/HMR), un SW met en cache
 * les assets et casse le hot-reload. La saisie terrain reste fonctionnelle en
 * ligne sans SW (flush = simple fetch). Monté une fois dans le root layout.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const tryFlush = () => {
      void flushOutbox().catch(() => {
        /* hors-ligne ou serveur KO : on retentera */
      });
    };

    // En dev : pas de SW, mais on tente quand même un flush au chargement.
    if (process.env.NODE_ENV !== 'production') {
      if (navigator.onLine) tryFlush();
      window.addEventListener('online', tryFlush);
      return () => window.removeEventListener('online', tryFlush);
    }

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    void navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              toast('Nouvelle version disponible', {
                duration: Infinity,
                action: {
                  label: 'Recharger',
                  onClick: () => (reg.waiting ?? installing).postMessage({ type: 'SKIP_WAITING' }),
                },
              });
            }
          });
        });
      })
      .catch(() => {
        /* l'app fonctionne sans SW */
      });

    const onOnline = () => {
      tryFlush();
      navigator.serviceWorker.ready
        .then((reg) => (reg as RegistrationWithSync).sync?.register('sync-pointages'))
        .catch(() => {});
    };
    window.addEventListener('online', onOnline);
    if (navigator.onLine) tryFlush();

    return () => {
      window.removeEventListener('online', onOnline);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
