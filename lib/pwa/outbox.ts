'use client';

/**
 * Outbox IndexedDB côté client (M5.5). Pendant la couche `idb` (bundlée) de ce
 * que le service worker fait en IndexedDB natif — MÊME contrat de schéma
 * (cf. public/sw.js, en-tête « CONTRAT IndexedDB partagé »).
 *
 *   DB 'erp-pointage' v1 · stores 'outbox' (keyPath clientUuid) & 'refs' (keyPath key)
 *
 * La saisie terrain :
 *   1. génère un clientUuid (UUID v7) → idempotency key,
 *   2. `enqueuePointage()` (optimistic UI immédiat),
 *   3. `flushOutbox()` si en ligne (sinon Background Sync via le SW au retour réseau).
 */

import { openDB, type IDBPDatabase } from 'idb';

import type {
  OutboxEntry,
  SyncItemResult,
  SyncResponse,
} from './types';

const DB_NAME = 'erp-pointage';
const DB_VERSION = 1;
const OUTBOX = 'outbox';
const REFS = 'refs';
const SYNC_ENDPOINT = '/api/v1/pointages';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB indisponible'));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(OUTBOX)) {
          db.createObjectStore(OUTBOX, { keyPath: 'clientUuid' });
        }
        if (!db.objectStoreNames.contains(REFS)) {
          db.createObjectStore(REFS, { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ───────────────────────── Outbox ─────────────────────────

/** Empile (ou écrase) une entrée d'outbox. Affichage optimiste immédiat. */
export async function enqueuePointage(entry: OutboxEntry): Promise<void> {
  const db = await getDb();
  await db.put(OUTBOX, entry);
}

/** Toutes les entrées, triées par création décroissante. */
export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await getDb();
  const all = (await db.getAll(OUTBOX)) as OutboxEntry[];
  return all.sort((a, b) => b.createdAtLocal.localeCompare(a.createdAtLocal));
}

/** Compteurs par statut (pour la bannière « N en attente »). */
export async function compterOutbox(): Promise<{
  pending: number;
  synced: number;
  rejected: number;
}> {
  const all = await listOutbox();
  return {
    pending: all.filter((e) => e.status === 'pending').length,
    synced: all.filter((e) => e.status === 'synced').length,
    rejected: all.filter((e) => e.status === 'rejected').length,
  };
}

/** Supprime une entrée (ex. : retirer un rejet après correction). */
export async function supprimerEntree(clientUuid: string): Promise<void> {
  const db = await getDb();
  await db.delete(OUTBOX, clientUuid);
}

/**
 * Synchronise les entrées `pending` avec le serveur (POST idempotent en lot).
 * Met à jour les statuts selon la réponse. Lève une erreur si le réseau ou le
 * serveur répond mal (les entrées restent `pending`, l'appelant peut ignorer).
 *
 * @returns la liste des résultats serveur (vide si rien à synchroniser).
 */
export async function flushOutbox(): Promise<SyncItemResult[]> {
  const db = await getDb();
  const all = (await db.getAll(OUTBOX)) as OutboxEntry[];
  const pending = all.filter((e) => e.status === 'pending');
  if (pending.length === 0) return [];

  let res: Response;
  try {
    res = await fetch(SYNC_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pointages: pending.map((e) => e.payload) }),
    });
  } catch (err) {
    await bumpAttempts(db, pending);
    throw err;
  }

  if (!res.ok) {
    await bumpAttempts(db, pending);
    throw new Error(`Sync HTTP ${res.status}`);
  }

  const data = (await res.json()) as SyncResponse;
  const results = Array.isArray(data.results) ? data.results : [];
  const byUuid = new Map(results.map((r) => [r.clientUuid, r]));
  const at = nowIso();

  for (const entry of pending) {
    const r = byUuid.get(entry.clientUuid);
    entry.lastTriedAt = at;
    if (!r) {
      entry.attempts += 1; // absent des résultats → reste pending, on réessaiera.
    } else if (r.status === 'synced' || r.status === 'duplicate') {
      entry.status = 'synced';
      if (r.id) entry.serverId = r.id;
    } else if (r.status === 'rejected') {
      entry.status = 'rejected';
      if (r.reason) entry.rejectReason = r.reason;
      if (r.message) entry.message = r.message;
    }
    await db.put(OUTBOX, entry);
  }

  return results;
}

async function bumpAttempts(db: IDBPDatabase, entries: OutboxEntry[]): Promise<void> {
  const at = nowIso();
  for (const entry of entries) {
    entry.attempts += 1;
    entry.lastTriedAt = at;
    await db.put(OUTBOX, entry);
  }
}

/**
 * Purge les entrées `synced` (et `rejected`) plus vieilles que `jours` jours.
 * Garde-fou anti-accumulation (ADR-004 : purge ~30 j).
 *
 * @returns le nombre d'entrées supprimées.
 */
export async function purgerOutbox(jours = 30): Promise<number> {
  const db = await getDb();
  const all = (await db.getAll(OUTBOX)) as OutboxEntry[];
  const limite = Date.now() - jours * 24 * 60 * 60 * 1000;
  let supprimes = 0;
  for (const entry of all) {
    if (entry.status === 'pending') continue;
    if (new Date(entry.createdAtLocal).getTime() < limite) {
      await db.delete(OUTBOX, entry.clientUuid);
      supprimes += 1;
    }
  }
  return supprimes;
}

// ───────────────────────── Données de référence ─────────────────────────

type RefsRecord<T> = { key: string; data: T; savedAt: string };

/** Met en cache local les données de référence (employés/chantiers/tâches). */
export async function sauvegarderRefs<T>(key: string, data: T): Promise<void> {
  const db = await getDb();
  await db.put(REFS, { key, data, savedAt: nowIso() } satisfies RefsRecord<T>);
}

/** Relit les données de référence en cache (null si absentes). */
export async function chargerRefs<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const rec = (await db.get(REFS, key)) as RefsRecord<T> | undefined;
  return rec ? rec.data : null;
}
