/*
 * Service Worker — ERP BTP / Pointage offline (M5.5).
 *
 * Écrit à la main (pas de Workbox / next-pwa) pour rester compatible Turbopack
 * et autonome. Cf. ADR-015. Trois responsabilités :
 *   1. Cache du shell applicatif (navigation NetworkFirst + assets CacheFirst)
 *      → l'app reste consultable hors-ligne.
 *   2. Fallback hors-ligne inline quand une navigation échoue sans cache.
 *   3. Synchronisation de l'outbox de pointages (Background Sync + message),
 *      en relisant IndexedDB en API native (le SW ne peut pas bundler `idb`).
 *
 * CONTRAT IndexedDB partagé avec lib/pwa/outbox.ts :
 *   - DB        : 'erp-pointage' (version 1)
 *   - stores    : 'outbox' (keyPath 'clientUuid'), 'refs' (keyPath 'key')
 *   Toute évolution de ce schéma doit être répercutée des DEUX côtés.
 *
 * Pour forcer une mise à jour client : bumper CACHE_VERSION (modifie le byte-
 * content du fichier → le navigateur installe un nouveau SW). Cf. runbook
 * docs/runbooks/pwa-deployment.md.
 */

const CACHE_VERSION = 'erp-btp-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const DB_NAME = 'erp-pointage';
const DB_VERSION = 1;
const OUTBOX_STORE = 'outbox';
const REFS_STORE = 'refs';

const SYNC_TAG = 'sync-pointages';
const SYNC_ENDPOINT = '/api/v1/pointages';
const REFS_ENDPOINT = '/api/v1/pointage-refs';

/** Assets statiques connus à pré-cacher dès l'installation. */
const PRECACHE_URLS = ['/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-maskable.svg'];

// ───────────────────────── Cycle de vie ─────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // addAll échoue en bloc si une URL 404 ; on tolère les manquants.
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))),
    ),
  );
  // Pas de skipWaiting() automatique : la mise à jour est confirmée par
  // l'utilisateur via la bannière (postMessage SKIP_WAITING).
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'FLUSH_OUTBOX') {
    event.waitUntil(flushOutbox());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(flushOutbox());
  }
});

// ───────────────────────── Stratégies fetch ─────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // POST de sync, etc. → réseau direct.

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // tiers → réseau direct.

  // Données de référence : NetworkFirst (frais si possible, sinon cache).
  if (url.pathname === REFS_ENDPOINT) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }
  // Autres API : pas de cache (toujours réseau).
  if (url.pathname.startsWith('/api/')) return;

  // Navigations (pages) : NetworkFirst → cache → fallback hors-ligne inline.
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Assets immuables Next : CacheFirst.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Autres GET same-origin (fonts, manifest…) : StaleWhileRevalidate léger.
  event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
});

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    // On ne met en cache que les réponses « ok » HTML (évite de cacher un 302
    // vers /login ou une 500).
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const shell = await caches.open(SHELL_CACHE);
    const any = await shell.match(request, { ignoreSearch: true });
    if (any) return any;
    return offlineResponse();
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        caches.open(cacheName).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => null);
  return cached || (await network) || new Response('', { status: 504 });
}

function offlineResponse() {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hors-ligne — ERP BTP</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;color:#1c1917;padding:24px}
  .card{max-width:380px;text-align:center}
  .logo{width:64px;height:64px;border-radius:16px;background:#f59e0b;color:#fff;display:inline-flex;
    align-items:center;justify-content:center;font-size:34px;font-weight:800;margin-bottom:16px}
  h1{font-size:20px;margin:0 0 8px}
  p{color:#57534e;font-size:14px;line-height:1.5;margin:0 0 20px}
  button{background:#f59e0b;color:#fff;border:0;border-radius:10px;padding:11px 18px;font-size:15px;font-weight:600;cursor:pointer}
</style></head><body><div class="card">
  <div class="logo">B</div>
  <h1>Vous êtes hors-ligne</h1>
  <p>Cette page n'est pas encore disponible hors connexion. Vos pointages déjà saisis sont conservés et seront synchronisés au retour du réseau.</p>
  <button onclick="location.reload()">Réessayer</button>
</div></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ───────────────────────── Outbox (IndexedDB natif) ─────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'clientUuid' });
      }
      if (!db.objectStoreNames.contains(REFS_STORE)) {
        db.createObjectStore(REFS_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(db, mode) {
  return db.transaction(OUTBOX_STORE, mode).objectStore(OUTBOX_STORE);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllOutbox(db) {
  return reqToPromise(txStore(db, 'readonly').getAll());
}

async function putEntry(db, entry) {
  const store = txStore(db, 'readwrite');
  return reqToPromise(store.put(entry));
}

/**
 * Vide l'outbox : POST en lot des entrées `pending`, puis applique les résultats
 * serveur (synced/duplicate → 'synced' ; rejected → 'rejected'). Idempotent et
 * sûr à appeler plusieurs fois (le serveur dédoublonne par client_uuid).
 */
async function flushOutbox() {
  let db;
  try {
    db = await openDb();
  } catch {
    return;
  }

  const all = await getAllOutbox(db);
  const pending = all.filter((e) => e && e.status === 'pending');
  if (pending.length === 0) return;

  let results = null;
  try {
    const res = await fetch(SYNC_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointages: pending.map((e) => e.payload) }),
    });
    if (!res.ok) {
      // 401/403/5xx : on retentera plus tard (on touche juste lastTriedAt).
      await bumpAttempts(db, pending);
      return;
    }
    const data = await res.json();
    results = Array.isArray(data.results) ? data.results : [];
  } catch {
    // Réseau KO : on laisse en pending pour le prochain cycle.
    await bumpAttempts(db, pending);
    return;
  }

  const byUuid = new Map(results.map((r) => [r.clientUuid, r]));
  const now = new Date().toISOString();
  for (const entry of pending) {
    const r = byUuid.get(entry.clientUuid);
    if (!r) {
      // Item absent des résultats (erreur inattendue serveur) → reste pending.
      entry.attempts = (entry.attempts || 0) + 1;
      entry.lastTriedAt = now;
    } else if (r.status === 'synced' || r.status === 'duplicate') {
      entry.status = 'synced';
      entry.lastTriedAt = now;
      if (r.id) entry.serverId = r.id;
    } else if (r.status === 'rejected') {
      entry.status = 'rejected';
      entry.rejectReason = r.reason;
      entry.message = r.message;
      entry.lastTriedAt = now;
    }
    await putEntry(db, entry);
  }

  await notifyClients({ type: 'OUTBOX_SYNCED' });
}

async function bumpAttempts(db, entries) {
  const now = new Date().toISOString();
  for (const entry of entries) {
    entry.attempts = (entry.attempts || 0) + 1;
    entry.lastTriedAt = now;
    await putEntry(db, entry);
  }
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) client.postMessage(message);
}
