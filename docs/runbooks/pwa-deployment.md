# Runbook — Déploiement & maintenance PWA (pointage offline, M5.5)

Couvre le Service Worker (`public/sw.js`), le manifest, l'outbox IndexedDB et la
procédure de mise à jour. Architecture : [ADR-004](../adr/004-offline-pointage.md) ·
Outillage : [ADR-015](../adr/015-pwa-sw-manuel.md).

## Pièces du dispositif

| Fichier                                                 | Rôle                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `app/manifest.ts`                                       | Manifest PWA (`/manifest.webmanifest`), installabilité.                                         |
| `public/icons/icon.svg`, `icon-maskable.svg`            | Icônes (purpose `any` + `maskable`).                                                            |
| `public/sw.js`                                          | Service Worker (cache shell + Background Sync + outbox).                                        |
| `lib/pwa/sw-register.tsx`                               | Enregistrement SW (prod), bannière de MAJ, flush au retour réseau. Monté dans `app/layout.tsx`. |
| `lib/pwa/outbox.ts`                                     | Outbox IndexedDB côté client (`idb`).                                                           |
| `lib/pwa/build-payload.ts`, `types.ts`, `use-online.ts` | Logique pure + types + hook réseau.                                                             |
| `app/api/v1/pointages` (POST)                           | Sync idempotente (`ON CONFLICT (client_uuid)`).                                                 |
| `app/api/v1/pointage-refs` (GET)                        | Référentiel (employés/chantiers/tâches) caché par le SW.                                        |
| `components/rh/pointage-terrain.tsx`                    | Écran de saisie terrain mobile-first.                                                           |
| migration `0061`                                        | Colonnes `client_uuid` + `server_received_at` + index unique.                                   |

> **Contrat IndexedDB partagé** : DB `erp-pointage` v1, stores `outbox`
> (keyPath `clientUuid`) et `refs` (keyPath `key`). Défini **deux fois** —
> `public/sw.js` (IDB natif) et `lib/pwa/outbox.ts` (`idb`). Toute évolution du
> schéma doit être répercutée des deux côtés **et** s'accompagner d'un bump de
> `DB_VERSION` + d'une logique d'upgrade.

## Le SW ne tourne qu'en production

`ServiceWorkerRegistrar` n'enregistre `/sw.js` que si
`process.env.NODE_ENV === 'production'`. En dev (`pnpm dev`, Turbopack), un SW
mettrait en cache les assets et **casserait le HMR**. Pour tester l'offline en
local : `pnpm build && pnpm start` puis ouvrir l'app.

## Publier une mise à jour du Service Worker

Le navigateur réinstalle le SW dès que **le contenu de `public/sw.js` change**
(comparaison octet-à-octet).

1. Modifier la logique du SW **et bumper `CACHE_VERSION`** (ex. `erp-btp-v1` →
   `erp-btp-v2`) en tête de `public/sw.js`. Le bump garantit la purge des anciens
   caches dans l'`activate`.
2. Déployer. Au prochain chargement, le nouveau SW s'installe puis **attend**.
3. `sw-register.tsx` affiche le toast **« Nouvelle version disponible »** →
   l'utilisateur clique **Recharger** → `SKIP_WAITING` → `controllerchange` →
   reload automatique.

> Ne **jamais** activer `skipWaiting()` automatiquement à l'install : un reload
> non sollicité pendant une saisie ferait perdre le formulaire en cours.

## Tester l'offline (manuel)

1. `pnpm build && pnpm start`, se connecter (rôle `chef_chantier` /
   `conducteur_travaux` / `rh` / `admin`).
2. Ouvrir **RH → Pointages → Pointage terrain**. Vérifier l'install (« Ajouter à
   l'écran d'accueil » sur mobile / icône d'installation desktop).
3. DevTools → **Network → Offline** (ou Application → Service Workers → Offline).
4. Saisir un pointage : il apparaît **« En attente »**, le bandeau passe en
   « Mode hors-ligne ».
5. Repasser **online** : le flush se déclenche (auto + bouton « Synchroniser ») ;
   l'entrée passe **« Synchronisé »**. Vérifier dans **RH → Pointages** (liste).

## Idempotence & conflits (rappel)

- **Double envoi / retry** → même `client_uuid` → `ON CONFLICT DO NOTHING` →
  `duplicate` (succès silencieux).
- **Deux appareils, même (employé, date, chantier, type)** → 2e rejeté par
  l'index métier `uq_pointages_employe_date_chantier_type` → outbox `rejected`
  (`doublon_metier`).
- **Chantier/tâche/employé supprimé entre-temps** → FK → `rejected`
  (`reference_supprimee`).
  Les rejets ne sont **pas** retentés ; l'utilisateur peut les retirer de la liste.

## Purge de l'outbox

`purgerOutbox(30)` (appelée au montage de l'écran terrain) supprime les entrées
`synced`/`rejected` de plus de 30 jours. Les `pending` ne sont jamais purgées
automatiquement (cf. ADR-004 : au-delà, remontée d'alerte RH — non implémenté).

## Dépannage

| Symptôme                                                   | Piste                                                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `/sw.js` ou `/manifest.webmanifest` redirige vers `/login` | Vérifier l'exclusion dans le `matcher` de `middleware.ts`.                                                          |
| SW pas mis à jour                                          | `CACHE_VERSION` non bumpé, ou onglet non rechargé. DevTools → Application → Service Workers → **Update on reload**. |
| Pointages bloqués « En attente » en ligne                  | Vérifier `POST /api/v1/pointages` (401 = session expirée ; 403 = rôle hors `ROLES_POINTAGE_WRITE`).                 |
| HMR cassé en dev                                           | Un SW d'un build de prod précédent traîne : DevTools → Application → **Unregister** + vider le cache.               |
| Données de référence périmées hors-ligne                   | Le SW sert le dernier `/api/v1/pointage-refs` mis en cache ; se reconnecter pour rafraîchir.                        |
