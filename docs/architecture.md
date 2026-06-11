# Architecture — Vue d'ensemble

> Révisé le 2026-05-21 : passage à une stack autonome (cf. [ADR-006](adr/006-stack-autonome.md)).

## C4 Niveau 1 — Contexte

```
                  ┌──────────────────────┐
                  │   Utilisateurs PME   │
                  │  (10-50 collabo­ra­- │
                  │   teurs BTP)         │
                  └──────────┬───────────┘
                             │ HTTPS
                             │
                  ┌──────────▼───────────┐
                  │     ERP BTP          │
                  │   (Next.js PWA)      │
                  └──────────┬───────────┘
                             │
       ┌─────────────────────┼─────────────────────┐
       │                     │                     │
 ┌─────▼─────┐        ┌──────▼─────┐      ┌───────▼────────┐
 │ PostgreSQL│        │  Sentry    │      │ Logiciel       │
 │ + MinIO   │        │ Monitoring │      │ comptable      │
 │ (auto-    │        │            │      │ (Cegid/Sage)   │
 │  hébergés)│        │            │      │ export TXT     │
 └───────────┘        └────────────┘      └────────────────┘
```

## C4 Niveau 2 — Conteneurs

```
┌─────────────────────────────────────────────────────────────┐
│               ERP BTP (monolithe Next.js)                   │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  UI (React)  │   │  Server      │   │  Background     │  │
│  │  App Router  │◄─►│  Actions +   │◄─►│  Jobs (cron OS  │  │
│  │  PWA SW      │   │  API Routes  │   │  ou pg_cron)    │  │
│  └──────────────┘   └──────┬───────┘   └────────┬────────┘  │
│                            │                     │           │
│  + Better Auth (lib NPM embarquée, MFA TOTP, magic link)    │
└────────────────────────────┼─────────────────────┼──────────-┘
                             │                     │
                    ┌────────▼─────────────────────▼──────────┐
                    │     Infrastructure auto-hébergée         │
                    │  ┌──────────┐  ┌──────────────────────┐ │
                    │  │PostgreSQL│  │ MinIO (S3-compatible)│ │
                    │  │ 16       │  │ Bucket: documents    │ │
                    │  │          │  │ Signed URLs          │ │
                    │  └──────────┘  └──────────────────────┘ │
                    │  ┌──────────────────────────────────┐   │
                    │  │ Mailpit (dev) / SMTP réel (prod) │   │
                    │  └──────────────────────────────────┘   │
                    └─────────────────────────────────────────┘
```

## Modules fonctionnels (bounded contexts)

Chaque module = un dossier dans `app/(app)/` + un schéma dans `db/schema/` + des validations Zod dans `lib/validation/`.

| Module           | Pages                       | Schéma DB                     |
| ---------------- | --------------------------- | ----------------------------- |
| `catalogue`      | `app/(app)/catalogue/`      | `db/schema/catalogue.ts`      |
| `commercial`     | `app/(app)/commercial/`     | `db/schema/commercial.ts`     |
| `chantiers`      | `app/(app)/chantiers/`      | `db/schema/chantiers.ts`      |
| `rh`             | `app/(app)/rh/`             | `db/schema/rh.ts`             |
| `achats`         | `app/(app)/achats/`         | `db/schema/achats.ts`         |
| `sous-traitance` | `app/(app)/sous-traitance/` | `db/schema/sous_traitance.ts` |
| `documents`      | `app/(app)/documents/`      | `db/schema/documents.ts`      |

## Règle de dépendance entre modules

Les modules ne s'importent **pas** directement entre eux. Pour un lien cross-module :

1. **FK directe** en base (lecture cross-module OK via JOIN Drizzle).
2. **Server Action dédiée** (pour les mutations cross-module).
3. Pas de partage de composants UI spécifiques à un domaine.

Les composants génériques (Button, Card, Table) vivent dans `components/ui/` et sont partagés.

## Flux d'authentification

```
[Browser] ──login──► [Better Auth route handler] ──session token──► [Browser (cookie HttpOnly)]
                            (Next.js /api/auth/*)                         │
                                                                          │ cookie envoyé
                                                                          ▼
                                                                [Next.js middleware]
                                                                          │
                                                                          │ user.role + user.id
                                                                          ▼
                                                                [Server Action / Page]
                                                                          │
                                                                          │ RLS Postgres (app_rw)
                                                                          ▼
                                                                    [Postgres]
```

## Flux offline (pointage)

Voir [ADR-004](adr/004-offline-pointage.md) pour le détail complet.

```
[UI pointage] ──► [IndexedDB] ──► [Outbox]
                                     │
                                     │ Background Sync
                                     ▼
                           [Server Action /api/v1/pointages]
                                     │
                                     │ INSERT ... ON CONFLICT DO NOTHING
                                     ▼
                                 [Postgres]
```

## Déploiement

```
[git push main]
       │
       ▼
[GitHub Actions]
   - pnpm install (cache)
   - pnpm check (lint + typecheck)
   - pnpm test
   - pnpm build
   - pnpm audit + Trivy
       │
       ▼
[Scaleway Serverless Container]
  (région Paris, image Docker distroless)
       │
       ▼
[Utilisateurs]
```

## Diagramme de dépendances des modules

```
                    ┌────────────┐
                    │ catalogue  │
                    └──────┬─────┘
                           │ (ouvrages, articles)
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
       ┌──────────┐  ┌──────────┐   ┌──────────┐
       │commercial│  │ chantiers│   │  achats  │
       │ (devis)  │─►│          │◄──│(commandes│
       └─────┬────┘  └─────┬────┘   └──────────┘
             │            │
             │            ▼
             │     ┌─────────────┐       ┌──────────────┐
             └────►│facturation  │◄──────│sous-traitance│
                   └─────────────┘       └──────────────┘
                        ▲                       │
                        │                       │
                        └───────────────────────┘
                            (factures ST)

       ┌────┐        ┌──────────────┐
       │ rh │───────►│   pointage   │────► [chantiers.taches]
       └────┘        └──────────────┘

       [documents administratifs] ──► [sous_traitants, fournisseurs]
```

## Contraintes transverses

### Base de données

- **Soft delete** : `deleted_at TIMESTAMPTZ NULL` sur toutes les tables métier, filtré dans chaque requête.
- **Audit** : mutation sensible → écrit dans `audit_log` (ancien + nouveau en JSONB).
- **Numérotation** : séquences Postgres dédiées par `(type, année)`. Voir [ADR-003](adr/003-numerotation.md).
- **Migrations** : toujours rétro-compatibles **en 2 étapes** (ajout nullable + backfill + NOT NULL).
- **RLS** : activée par défaut sur tables sensibles.
- **Monétaire** : `NUMERIC(14,2)` exclusivement, jamais de `FLOAT`.

### API

- **Versioning** : `/api/v1/`, rupture = nouvelle version.
- **Server Actions** préférées pour les mutations UI.
- **DTO ≠ entités ORM** : Zod à l'entrée, types inférés en sortie.

### Sécurité

- OWASP ASVS niveau 2. Voir [SECURITY.md](../SECURITY.md).
- Toutes les entrées validées avec Zod.
- Secrets uniquement via variables d'environnement.

### Observabilité

- Sentry (erreurs client + serveur) dès M1.
- Logs structurés JSON, corrélation par `request_id`.
- OpenTelemetry envisagé M10+.

## Structure de `lib/`

```
lib/
├── db/
│   └── client.ts          # Client Drizzle (app_rw)
├── auth/
│   ├── server.ts          # Config Better Auth (sessions, MFA, magic link)
│   ├── guards.ts          # requireAuth(role) pour les pages/actions
│   └── rbac.ts            # Définition des rôles et permissions
├── storage/
│   └── s3.ts              # Client S3 (MinIO en dev, Scaleway en prod) + signed URLs
├── audit/
│   └── log.ts             # Helper audit_log
├── numbering/
│   └── generate.ts        # Appel à la fonction PG generate_numero
├── validation/
│   ├── common.ts          # Schémas Zod partagés (siret, iban, tva)
│   └── [domaine].ts       # Schémas par domaine
└── utils/
    └── cn.ts              # Helper Tailwind classnames
```
