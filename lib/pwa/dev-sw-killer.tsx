/**
 * Self-heal dev contre un service worker PWA résiduel.
 *
 * Un SW laissé par un `next build && next start` local (ou un déploiement sur le
 * même origin) sert les chunks `/_next/static/` en **CacheFirst** (cf.
 * `public/sw.js`). En dev, il peut donc resservir un chunk périmé après un bump
 * de deps → erreur Turbopack « module factory is not available / deleted in an
 * HMR update », insensible au Ctrl+Maj+R, qui réapparaît page par page.
 *
 * Le garde-fou de `lib/pwa/sw-register.tsx` désinscrit bien le SW en dev, mais il
 * vit dans un `useEffect` : il ne s'exécute donc qu'APRÈS le mount React — trop
 * tard, car le chunk cassé plante le bundle AVANT. D'où ce script **inline, rendu
 * côté serveur** dans le <body> : il s'exécute pendant le parse du document.
 *
 * Astuce de robustesse : même si le chunk cassé plante juste après, la callback de
 * la promesse `getRegistrations()` survit au throw synchrone du chunk → la
 * désinscription + le `location.reload()` s'exécutent quand même, et la page se
 * rétablit d'elle-même (au pire un bref flash de l'overlay d'erreur).
 *
 * DEV UNIQUEMENT : en prod le SW est une vraie capacité offline qu'il ne faut pas
 * tuer (le composant renvoie `null`). En dev, la CSP autorise `'unsafe-inline'`
 * (cf. `lib/security/csp.ts`) → ce script inline passe sans nonce.
 */

/**
 * Clé de session du compteur de tentatives (garde anti-boucle). ⚠️ Doit rester
 * synchronisée avec le littéral dans `devSwCleanup` ci-dessous (la fonction ne
 * peut PAS référencer cette const : elle est sérialisée via `.toString()`).
 */
export const DEV_SW_CLEAN_KEY = '__erpDevSwClean';

/** Nombre maximal de rechargements automatiques avant d'abandonner. */
export const DEV_SW_MAX_ATTEMPTS = 2;

/**
 * Logique exécutée dans le navigateur. **Auto-suffisante** : elle n'utilise que
 * des globals navigateur + des consts locales, car elle est sérialisée via
 * `.toString()` dans un <script> inline — toute référence à un import ou à une
 * variable de module casserait à l'exécution. Exportée pour les tests unitaires.
 *
 * Points subtils (cf. incident 2026-06-17) :
 *  - `reg.unregister()` ne libère PAS immédiatement l'onglet courant : le SW
 *    continue de contrôler la page jusqu'à son déchargement, donc le `reload()`
 *    reste sous son contrôle. On ATTEND donc la purge des caches AVANT de
 *    recharger → le CacheFirst du SW rate → il va chercher le chunk frais sur le
 *    réseau (et le re-cache à jour). Sans cette attente, le reload reservait le
 *    chunk périmé et le bug réapparaissait.
 *  - On purge TOUS les caches (pas seulement `erp-btp-*`) : robuste même si le SW
 *    résiduel provient d'une autre app sur le même origin (cas localhost:3000).
 *  - Compteur borné plutôt qu'un flag one-shot : autorise un 2e passage si la 1re
 *    tentative n'a pas suffi, tout en évitant une boucle de reload infinie.
 */
export function devSwCleanup(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const KEY = '__erpDevSwClean';
  const MAX = 2;
  let attempts = 0;
  try {
    attempts = Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    // sessionStorage indisponible (mode privé strict) : on tente sans garde.
  }
  if (attempts >= MAX) return; // abandon borné : les caches sont de toute façon vidés.
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      if (!regs || regs.length === 0) {
        // État propre : on réarme le compteur pour un éventuel futur SW résiduel.
        if (attempts > 0) {
          try {
            sessionStorage.removeItem(KEY);
          } catch {
            // ignore
          }
        }
        return;
      }
      const clearCaches =
        typeof caches !== 'undefined'
          ? caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          : Promise.resolve([] as boolean[]);
      const unregisterAll = Promise.all(regs.map((r) => r.unregister()));
      void Promise.all([clearCaches, unregisterAll]).then(() => {
        try {
          sessionStorage.setItem(KEY, String(attempts + 1));
        } catch {
          // ignore : sans compteur, l'état propre au prochain tour stoppera la boucle.
        }
        location.reload();
      });
    })
    .catch(() => {
      // SW injoignable : rien à faire.
    });
}

/**
 * Rend le script inline `devSwCleanup` en **dev uniquement**. À monter le plus tôt
 * possible dans le <body> du layout racine pour qu'il s'exécute avant les chunks
 * applicatifs.
 */
export function DevServiceWorkerKiller() {
  if (process.env.NODE_ENV === 'production') return null;
  return <script dangerouslySetInnerHTML={{ __html: `(${devSwCleanup.toString()})();` }} />;
}
