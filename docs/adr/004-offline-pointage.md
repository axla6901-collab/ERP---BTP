# ADR-004 — Stratégie offline-first pour le pointage chantier

- **Statut** : Accepté
- **Date** : 2026-04-21
- **Décideur** : @aacosta

## Contexte

Exigence utilisateur confirmée : le **pointage chantier doit fonctionner sans réseau**. Les ouvriers saisissent leurs heures sur smartphone/tablette depuis des chantiers où le signal est aléatoire (sous-sols, zones rurales, intérieur de bâtiments en construction, parkings souterrains).

Caractéristiques du pointage :

- **Asynchrone** : la donnée peut remonter 1h ou 1 jour plus tard sans impact métier immédiat.
- **Append-only** côté utilisateur terrain : on crée une ligne de pointage, on ne modifie pas un pointage historique.
- **Peu conflictuel** : un même employé ne pointe qu'une seule fois par jour par tâche (contrainte métier).
- **Volume faible** : ~20 pointages/employé/semaine.

## Décision

Adopter une **PWA (Progressive Web App) avec outbox pattern** pour le pointage, implémentée dans le module `rh/pointage` (M5).

### Architecture

```
┌─────────────────┐
│  UI pointage    │
│  (mobile-first) │
└────────┬────────┘
         │ (1) saisie
         ▼
┌─────────────────────────┐
│ IndexedDB (local store) │ ───► (2) affichage immédiat
│ + Outbox queue          │      (optimistic UI)
└────────┬────────────────┘
         │ (3) Background Sync quand réseau revient
         ▼
┌─────────────────────────────┐
│ Server Action               │
│ /api/v1/pointages (POST)    │
│ Idempotence: client_uuid    │
│ INSERT ... ON CONFLICT ...  │
└────────┬────────────────────┘
         │ (4)
         ▼
┌──────────────┐
│   Postgres   │
└──────────────┘
```

### Composants techniques

| Composant | Rôle |
|---|---|
| **Workbox** (Google) | Génération du Service Worker, stratégies de cache |
| **Cache strategies** | `NetworkFirst` pour HTML, `CacheFirst` pour assets |
| **IndexedDB via `idb`** | Stockage local typesafe (librairie wrapper TypeScript) |
| **Background Sync API** | Retry automatique quand le réseau revient |
| **Fallback polling** | Sur iOS Safari (Background Sync mal supporté), polling 30s quand l'app est au focus |

### Outbox pattern détaillé

Chaque pointage saisi en mode offline :

1. **Génère un `client_uuid` (UUID v7)** côté client → sert d'**idempotency key**.
2. **Écrit dans IndexedDB store `pointages`** (affichage immédiat — optimistic UI).
3. **Empile dans IndexedDB store `outbox_pointages`** avec statut `pending`.
4. Un worker tente de POSTer au serveur :
   - **Succès** : retire de l'outbox, marque `pointages` local comme `synced`.
   - **Échec réseau** : garde dans l'outbox avec `attempts++`, retry exponential backoff (30s, 2min, 10min, 1h, 6h, 24h).
   - **Échec validation serveur (Zod)** : flag `rejected` avec message d'erreur, remonte une alerte à l'utilisateur au prochain focus.
   - **Conflit FK (chantier ou tâche supprimé)** : flag `rejected` avec explication.

Côté serveur :

```typescript
// Server Action simplifiée
export async function createPointage(input: PointageInput) {
  const data = pointageSchema.parse(input);

  await db.insert(pointages)
    .values(data)
    .onConflictDoNothing({ target: pointages.clientUuid });

  return { ok: true };
}
```

→ `ON CONFLICT (client_uuid) DO NOTHING` rend l'endpoint **idempotent**. Double soumission = succès silencieux, pas de doublon.

### Résolution de conflits

**Cas 1 : même pointage soumis deux fois** (utilisateur qui double-tape, retry après timeout réseau)
→ `client_uuid` identique → idempotence serveur → pas de doublon.

**Cas 2 : chantier ou tâche supprimé côté serveur entre-temps**
→ FK Postgres rejette l'INSERT → entry outbox flaggée `rejected`, l'utilisateur voit une notif au retour en ligne ("Le chantier a été supprimé, ton pointage du 12/03 n'a pas pu être enregistré").

**Cas 3 : employé pointe 2 fois sur la même date/tâche depuis 2 appareils différents**
→ Unicité métier `UNIQUE (employe_id, date_pointage, tache_id)` → second pointage rejeté avec message clair ("Un pointage existe déjà pour cette date et cette tâche").

**Cas 4 : horloge smartphone décalée**
→ Le serveur **tamponne avec sa propre horloge** dans un champ `server_received_at`.
→ Le champ métier `date_pointage` reste celui saisi par l'utilisateur (c'est la **date de réalisation du travail**, pas la date de sync).

### Données en cache côté client

- **Pointages consultables offline** : les **7 derniers jours** de l'utilisateur connecté.
- **Chantiers actifs auxquels il a accès** : liste minimale (id, nom, adresse, responsable) — refresh quotidien en tâche de fond.
- **Tâches actives sur ces chantiers** : liste minimale.
- **Pas de cache** pour les autres modules (factures, montants, RH globale).

### Sécurité offline

- Pas de secret applicatif en IndexedDB. Le token JWT reste en cookie HttpOnly.
- Purge automatique de l'outbox après 30 jours (les pointages non synchronisés au-delà sont considérés abandonnés et remontent en alerte RH).
- En M5 : optionnel PIN local côté client (chiffrement IndexedDB via WebCrypto `AES-GCM`). Obligatoire en M10.

### Limites assumées

- **Consultation historique offline limitée à 7 jours** : éviter de stocker la base entière sur l'appareil.
- **Création de chantiers/tâches hors-ligne non supportée** : nécessite connexion, c'est un acte administratif qui reste au bureau.
- **Saisie photo offline non supportée** M0 → M5 (reportée à M7 si besoin).
- **Géolocalisation** : non dans le cahier des charges initial.

## Conséquences

### Positives

- Expérience utilisateur fluide même sans réseau.
- **Idempotence côté serveur** : résiliente aux duplications, aux retries, aux pannes partielles.
- Un seul codebase (pas de divergence entre app mobile et app web).
- Pas d'App Store (distribution via URL + installation "Add to Home Screen").

### Négatives / Risques

- Service Worker ajoute une complexité de debug (caches persistants, versions, migrations de cache).
- **iOS Safari quirks** sur le Background Sync → fallback polling nécessaire (documenté).
- IndexedDB peut être **purgé par le navigateur** si le stockage est plein → l'outbox doit être **idempotent avec retry côté utilisateur** si purge observée.
- **Mise à jour de l'app** : le Service Worker doit être versionné correctement, sinon les utilisateurs se retrouvent avec une version cachée. Mitigation : stratégie `skipWaiting()` contrôlée + bannière "Nouvelle version disponible, recharger ?".

### Mitigations

- Monitoring Sentry des erreurs Service Worker.
- Test E2E Playwright avec simulation offline (`context.setOffline(true)`).
- Runbook `docs/runbooks/pwa-deployment.md` pour les procédures de mise à jour (à créer M5).
- Bannière UI claire : "Mode hors-ligne — X pointages en attente de synchronisation".

## Alternatives considérées

1. **App native Flutter / React Native** — rejetée : stores, double build, complexité de déploiement, coût (99€/an Apple). 1 seul dev ne peut pas maintenir.
2. **Saisie papier + saisie PC différée** — rejetée : rejet utilisateur attendu, perte de données, non temps-réel.
3. **Simple `fetch` optimistic sans outbox** — rejetée : perd des pointages si l'onglet ferme pendant une déconnexion.
4. **PouchDB + CouchDB** (sync bidirectionnelle) — rejetée : sur-dimensionné pour de l'append-only, complexité de modèle.
5. **Remix SPA mode + offline Service Worker** — rejetée : Next.js App Router couvre le besoin avec Workbox.

## Révision

À revisiter si :
- Volume de pointages dépasse 10 000/jour (envisager CDN edge + broker).
- Besoin de modifier un pointage historique offline (non prévu M0-M10).
- iOS Background Sync devient fiable (simplifier en supprimant le polling de fallback).
