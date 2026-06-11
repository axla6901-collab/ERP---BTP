# ADR-015 — Service Worker écrit à la main (PWA pointage M5.5)

- **Statut** : Accepté
- **Date** : 2026-06-10
- **Décideur** : @aacosta
- **Complète / amende** : [ADR-004](004-offline-pointage.md) (l'architecture offline-first reste valable ; seul l'outillage du Service Worker change)

## Contexte

L'ADR-004 (2026-04-21) actait une PWA offline-first pour le pointage et citait
**Workbox** pour générer le Service Worker. Ce choix est **antérieur à deux
décisions structurantes** prises depuis :

1. **Build basculé sur Turbopack** (`next build --turbopack`, cf. mémoire « Vite
   vs Turbopack »). Les intégrations PWA couplées au bundler (`next-pwa`,
   `@ducanh2912/next-pwa`, et même `@serwist/next` dont le support Turbopack
   reste expérimental) injectent une configuration **webpack** → incompatibles
   ou fragiles avec le build actuel.
2. **Exigence d'autonomie / simplicité** (mémoire « Autonomie & confidentialité »,
   projet maintenu par 1 personne non-développeuse sur 5+ ans) : on privilégie
   des composants génériques, lisibles et débogables sans abstraction lourde.

## Décision

Écrire le **Service Worker à la main** (`public/sw.js`, ~250 lignes de JS
commenté), **sans Workbox ni plugin bundler**. L'**architecture** de l'ADR-004
(outbox IndexedDB, idempotence par `client_uuid`, Background Sync + fallback,
cache 7 jours) est **conservée intégralement** — seul l'outil de génération du SW
change.

### Conséquences concrètes

| Aspect          | Choix                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Génération SW   | Aucune. `public/sw.js` est servi tel quel (statique).                                                                                                                                      |
| Cache           | Stratégies écrites à la main : `NetworkFirst` (navigation + `/api/v1/pointage-refs`), `CacheFirst` (`/_next/static`, `/icons`), fallback hors-ligne **inline** (pas de route `/offline`).  |
| IndexedDB       | Côté **client React** : `idb` (déjà en dépendances). Côté **SW** : API IndexedDB **native** (le SW ne peut pas bundler `idb`). Contrat de schéma partagé documenté dans les deux fichiers. |
| Background Sync | `sync` tag `sync-pointages` (Chrome/Android). Fallback iOS : flush déclenché par le client à l'ouverture + à chaque `online` (cf. `lib/pwa/sw-register.tsx`).                              |
| Mise à jour     | Pas de `skipWaiting()` auto : bannière « Nouvelle version disponible » → `postMessage('SKIP_WAITING')` → `controllerchange` → reload. Versionnée par `CACHE_VERSION` dans `public/sw.js`.  |
| Environnement   | SW **enregistré en production uniquement** (en dev il casse le HMR Turbopack). La saisie terrain reste fonctionnelle en ligne sans SW.                                                     |

### Dépendances

**Aucune nouvelle dépendance** : `idb` et `uuid` (v7) étaient déjà présents.

## Alternatives considérées

1. **`next-pwa` / `@ducanh2912/next-pwa`** — rejeté : webpack-only, incompatible
   `next build --turbopack`.
2. **`@serwist/next`** — rejeté : re-couple au bundler, support Turbopack
   expérimental sur Next 15 → risque de friction sur le build de prod.
3. **`workbox-build` en script standalone** (`injectManifest`) — honorerait
   l'ADR-004 sans plugin bundler, mais ajoute 6+ `devDependencies` Workbox et une
   étape de build à maintenir, pour un besoin de cache modeste. Rejeté au profit
   de la simplicité (SW à la main).

## Limites / dette assumée

- **Icônes au format SVG** (`/icons/icon.svg`, `icon-maskable.svg`). Suffisant
  pour l'installabilité Chrome/Android. Des PNG `apple-touch-icon` 180/192/512
  pourraient être ajoutés ultérieurement pour iOS (polish, non bloquant).
- **CSP** reste un bloquant séparé (audit B3) — non traité ici. Le SW est
  same-origin et ne dépend pas de la CSP.
- **Pas de précache du shell HTML** (routes dynamiques tenant) : on s'appuie sur
  le cache runtime des navigations déjà visitées.

## Révision

À revisiter si :

- iOS supporte un jour le Background Sync de façon fiable (supprimer le flush de
  fallback),
- les besoins de cache se complexifient au point de justifier Workbox,
- la CSP est mise en place (vérifier `worker-src 'self'` / `script-src`).
