# ADR-006 — Bascule vers une stack 100 % autonome (abandon de Supabase)

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta
- **Supersede** : [ADR-001](001-stack.md) (briques DB / Auth / Storage)

## Contexte

L'ADR-001 retenait **Supabase** (Postgres managé + Auth + Storage) comme socle de l'ERP, avec un fallback auto-hébergement éventuel pour une « exigence de souveraineté forte plus tard ». Cette exigence est devenue **immédiate** : @aacosta exige une application **100 % autonome** pour des raisons de **confidentialité** des données métier (clients, chantiers, finances de la PME BTP).

Cette exigence va au-delà de la souveraineté géographique : elle exclut **toute dépendance à un fournisseur tiers identifiable**, y compris Supabase en self-hosted (la dépendance à la marque/projet est perçue comme un risque de pérennité, de licence, de télémétrie).

Le projet est en **phase M0** : les fondations sont écrites mais **aucun code applicatif n'utilise encore Supabase**. Le coût de bascule est donc minimal.

## Décision

Remplacer les 3 briques Supabase par des composants open-source **génériques** ou des bibliothèques **embarquées dans l'application** :

| Brique               | Avant (ADR-001)          | Après (ADR-006)                                                  |
| -------------------- | ------------------------ | ---------------------------------------------------------------- |
| Base de données      | Supabase Postgres managé | **PostgreSQL 16** (image officielle Docker `postgres:16-alpine`) |
| Authentification     | Supabase Auth (GoTrue)   | **Better Auth** (bibliothèque NPM embarquée dans Next.js)        |
| Storage objet        | Supabase Storage         | **MinIO** (S3-compatible, Docker)                                |
| SMTP dev             | Supabase Inbucket        | **Mailpit** (Docker)                                             |
| UI admin DB          | Supabase Studio          | **Drizzle Studio** (`pnpm db:studio`, déjà inclus)               |
| Orchestration locale | Supabase CLI             | **`docker-compose.yml`** versionné dans le repo                  |

### Choix Better Auth (et pas Auth.js / Lucia / Keycloak)

- **Auth.js (NextAuth v5)** : standard de fait mais v5 encore en beta fin 2025, MFA TOTP via adaptateur tiers, configuration verbeuse. Écarté pour la complexité.
- **Lucia** : auteur a annoncé la fin du projet en 2025. Écarté.
- **Keycloak / Ory Hydra** : serveurs d'identité externes — réintroduisent un fournisseur tiers à opérer. Écarté en cohérence avec l'exigence d'autonomie.
- **Better Auth** : bibliothèque NPM moderne (2024), intégration Drizzle native, MFA TOTP + magic link + OAuth + password reset natifs, DX simple. Communauté jeune mais croissance rapide. Retenu.

### Choix MinIO (et pas filesystem local / Postgres Large Objects)

- **Filesystem local** : pas de signed URLs (sécurité plus faible pour documents sensibles), pas adapté à un futur déploiement multi-instance. Écarté.
- **Postgres Large Objects / bytea** : alourdit la DB, performances dégradées au-delà de quelques Go. Écarté pour des fichiers BTP (PDF, photos chantier) pouvant atteindre 20 Mo.
- **MinIO** : S3-compatible (Scaleway Object Storage en cible prod : changement d'endpoint = aucune ligne de code à modifier), signed URLs natifs, image Docker légère. Retenu.

### Architecture cible (dev local)

```
┌─ Machine locale (Windows 11 + Docker Desktop) ──────────────────┐
│  docker-compose.yml                                              │
│    ├─ postgres:16-alpine             :5432                       │
│    ├─ minio/minio:latest             :9000 (S3) / :9001 (UI)     │
│    └─ axllent/mailpit:latest         :1025 (SMTP) / :8025 (UI)   │
│                                                                   │
│  Next.js (`pnpm dev`)                :3000                       │
│    ├─ Better Auth (lib NPM)          → Postgres                  │
│    ├─ Drizzle ORM                    → Postgres                  │
│    └─ Client S3 (AWS SDK)            → MinIO                     │
└──────────────────────────────────────────────────────────────────┘
```

### Production (cible Scaleway, à formaliser plus tard)

- **Postgres** : Scaleway Managed Database for PostgreSQL (Paris) — hébergement FR, ou auto-hébergé sur VPS si autonomie totale exigée
- **Storage** : Scaleway Object Storage (S3-compatible, Paris) — change uniquement `S3_ENDPOINT`
- **SMTP** : OVH SMTP, Brevo, ou Postfix auto-hébergé
- **Better Auth** : tourne dans le conteneur Next.js, aucune brique externe

Un ADR-007 dédié au déploiement production sera créé en M6/M7.

## Conséquences

### Positives

- **Autonomie totale** : zéro fournisseur tiers identifiable dans le runtime
- **Coût** : gratuit en dev, coûts prévisibles en prod (Scaleway managé ou VPS)
- **Reproductibilité** : `docker compose up -d` = environnement complet en une commande
- **Portabilité** : la stack peut tourner sur n'importe quelle machine, n'importe quel cloud
- **Phase M0** : aucun code applicatif à refactorer
- **S3-compatibilité** : migration future vers Scaleway Object Storage = changement d'un endpoint

### Négatives / Risques

- **Surface ops accrue** : @aacosta doit comprendre Docker, gérer des conteneurs, scripter les backups. **Mitigation** : runbook `infra-locale.md` détaillé, healthchecks intégrés, Drizzle Studio comme interface admin
- **Better Auth est jeune** (créé 2024) : moins de tutoriels qu'Auth.js, API non figée. **Mitigation** : documentation officielle solide ([better-auth.com](https://www.better-auth.com)), code peu intrusif et facilement remplaçable
- **Sécurité d'auth** : on perd l'audit sécurité communautaire de Supabase. **Mitigation** : Better Auth utilise des primitives standard (Argon2id, JWT), revue OWASP ASVS lors d'un audit M5
- **Sauvegardes** : il faut désormais opérer `pg_dump` et `mc mirror` (MinIO) au lieu de profiter des backups managés Supabase. **Mitigation** : ADR backups dédié + automatisation cron en M2
- **Pas de Realtime out-of-the-box** : si besoin futur, ajouter un broker (NATS, Redis Pub/Sub) ou WebSocket Next.js

## Alternatives considérées

1. **Supabase self-hosted via CLI Docker** — proposé initialement comme « fallback » de l'ADR-001. Rejeté car même la marque/projet Supabase est perçue comme une dépendance tierce ; principe d'autonomie absolue.
2. **PocketBase (SQLite + auth + storage tout-en-un)** — rejeté pour les mêmes raisons que dans l'ADR-001 (SQLite peu adapté à la cohérence transactionnelle et aux volumes BTP).
3. **Auth.js (NextAuth v5)** — voir section décision.
4. **Keycloak auto-hébergé** — voir section décision.

## Impact sur les ADR existants

- **ADR-001** : marqué `Superseded by ADR-006` pour les briques DB/Auth/Storage. Conservé pour la traçabilité des choix Next.js, Drizzle, shadcn/ui, PWA, Scaleway.
- **ADR-002** : révisé. La synchronisation `auth.users` (Supabase) → `utilisateurs` est remplacée par un lien direct entre la table `user` (Better Auth) et la table `utilisateurs` (RBAC métier). La séparation `utilisateurs` / `employes` reste inchangée.
- **ADR-003, 004, 005** : aucun impact (logique métier indépendante).

## Révision

À revisiter si :

- Better Auth annonce sa fin ou une migration majeure incompatible
- L'équipe s'étoffe et un serveur d'identité externe (Keycloak) devient justifiable
- Un besoin Realtime majeur émerge
