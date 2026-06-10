/**
 * Types partagés entre le client PWA (navigateur / service worker) et le
 * serveur (route de sync). **Types uniquement** — ce module ne doit importer
 * aucun code `server-only` ni aucune API DOM, pour rester importable des deux
 * côtés (et dans le SW en JS brut, où il sert de documentation du contrat).
 */

import type { PointageSyncInput, ZoneDeplacement } from '@/lib/validation/rh';

/** Charge utile d'un pointage synchronisé (corps POST /api/v1/pointages). */
export type PointageSyncPayload = PointageSyncInput;

// ───────────────────────── Données de référence terrain ─────────────────────────

export type RefEmploye = {
  id: string;
  nom: string;
  prenom: string;
  zoneDeplacementDefaut: ZoneDeplacement | null;
};
export type RefChantier = { id: string; numero: string; libelle: string };
export type RefTache = { id: string; chantierId: string; libelle: string };

/** Référentiel minimal mis en cache pour la saisie hors-ligne. */
export type PointageRefs = {
  employes: RefEmploye[];
  chantiers: RefChantier[];
  taches: RefTache[];
};

/** Raison d'un rejet définitif (l'outbox ne doit PAS retenter). */
export type SyncRejectReason =
  /** Unicité métier (employé, date, chantier, type) déjà prise par un autre appareil. */
  | 'doublon_metier'
  /** FK rompue : chantier / tâche / employé supprimé côté serveur entre-temps. */
  | 'reference_supprimee'
  /** Validation Zod ou contrainte CHECK rejetée (données incohérentes). */
  | 'donnees_invalides';

/** Résultat serveur pour un item de la sync. */
export type SyncItemResult = {
  clientUuid: string;
  /** `synced` = inséré ; `duplicate` = déjà reçu (idempotent) ; `rejected` = abandonné. */
  status: 'synced' | 'duplicate' | 'rejected';
  reason?: SyncRejectReason;
  message?: string;
  /** id serveur du pointage inséré (présent si `synced`). */
  id?: string;
};

/** Réponse de POST /api/v1/pointages (traitement par lot). */
export type SyncResponse = {
  results: SyncItemResult[];
};

/** Statut local d'une entrée d'outbox côté IndexedDB. */
export type OutboxStatus = 'pending' | 'synced' | 'rejected';

/** Entrée stockée dans l'object store `outbox` d'IndexedDB. */
export type OutboxEntry = {
  /** Clé primaire = idempotency key (UUID v7). */
  clientUuid: string;
  payload: PointageSyncPayload;
  status: OutboxStatus;
  /** Nombre de tentatives d'envoi. */
  attempts: number;
  /** Date de création locale (ISO) — pour l'affichage et la purge à 30 j. */
  createdAtLocal: string;
  /** Date du dernier essai de sync (ISO) ou null. */
  lastTriedAt: string | null;
  /** Raison de rejet (si status = rejected). */
  rejectReason?: SyncRejectReason;
  /** Message lisible (rejet ou dernière erreur). */
  message?: string;
  /** id serveur une fois synchronisé (informational). */
  serverId?: string;
  /** Libellés dénormalisés pour l'affichage hors-ligne (pas renvoyés au serveur). */
  display: {
    employeNom: string;
    chantierLibelle: string | null;
    typeLabel: string;
  };
};
