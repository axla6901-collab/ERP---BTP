# ADR-001 — Stack technique de l'ERP Bâtiment

- **Statut** : **Partiellement superseded par [ADR-006](006-stack-autonome.md)** (2026-05-21) pour les briques DB / Auth / Storage. Les autres choix (Next.js, Drizzle, shadcn/ui, PWA, Scaleway) restent en vigueur.
- **Date** : 2026-04-21
- **Décideur** : @aacosta

## Contexte

Projet : développer un ERP sectoriel BTP couvrant 8 domaines fonctionnels (cf. [docs/MCD.md](../MCD.md)), construit module par module.

Contraintes confirmées le 2026-04-21 :

- **Équipe : 1 personne, non développeuse**. Mode de travail "tuteur + générateur" avec un assistant IA.
- **Mono-tenant** (une seule entreprise utilisatrice).
- **10 à 50 utilisateurs cibles**.
- **Français uniquement** (pas d'i18n).
- **Hébergement** : local en dev, cloud FR en prod (Scaleway Paris prévu).
- **Offline-first obligatoire** pour le pointage smartphone/tablette (cf. [ADR-004](004-offline-pointage.md)).
- **Sécurité** : OWASP ASVS niveau 2 en cible.
- **Conformité FR** : auto-liquidation TVA BTP, Factur-X à terme, export Cegid/Sage (cf. [ADR-005](005-export-compta-fr.md)).
- **Pas de reprise de données**.
- **Durabilité visée** : 5+ ans, ajout de modules au fil de l'eau sans régression.
- **Fichiers** : 20 Mo max par upload.

Proposition initiale envisagée : **NestJS + Prisma + React/Vite + Keycloak auto-hébergé + Kubernetes**. Évaluation : trop lourde pour 1 dev non-expert, triple la surface de maintenance.

## Décision

### Stack retenue

| Couche | Technologie | Version cible |
|---|---|---|
| Langage | **TypeScript strict** | 5.6+ |
| Framework full-stack | **Next.js 15** (App Router) | 15.x |
| Base de données | **PostgreSQL** via **Supabase** (EU-West) | 16+ |
| ORM / Migrations | **Drizzle ORM** | 0.36+ |
| Auth | **Supabase Auth** (MFA TOTP, magic link, OAuth) | cloud ou self-host |
| Storage fichiers | **Supabase Storage** (S3 compatible) | intégré |
| UI | **shadcn/ui + Tailwind CSS** | shadcn 2.x, TW 3.4 |
| Formulaires / Validation | **React Hook Form + Zod** | RHF 7.x, Zod 3.23+ |
| État client & data fetching | **TanStack Query** + **Server Actions** Next.js | |
| Tests unitaires | **Vitest** | 2.x |
| Tests E2E | **Playwright** | 1.47+ |
| Observabilité | **Sentry** (erreurs) | |
| CI/CD | **GitHub Actions** | |
| Hébergement prod | **Scaleway Serverless Containers** (région Paris) | |
| Mobile / Offline | **PWA** (Service Worker, IndexedDB, Workbox, outbox pattern) | |
| Gestionnaire paquets | **pnpm** | 9.x |

### Justifications des choix

**Next.js full-stack plutôt que NestJS + React séparés** :
- Un seul projet, un seul langage, un seul déploiement, un seul lint, un seul format.
- Server Actions simplifient les mutations sans définir un contrat REST explicite dans 90 % des cas.
- À maintenir par 1 personne : stack la plus concentrée du marché TypeScript.
- Documentation et tutoriels pléthoriques.

**Supabase plutôt que Keycloak + Postgres auto-hébergés** :
- Auth managée (MFA TOTP, magic link, OAuth, password reset) : ~500 lignes de code économisées et audit de sécurité déjà fait par Supabase.
- RLS Postgres natif bien outillé (policies versionnables en SQL).
- Storage S3 intégré avec signed URLs.
- Région EU disponible (Francfort ; Paris annoncée en roadmap).
- **Fallback auto-hébergement** possible (Supabase est open-source) si exigence de souveraineté forte plus tard.

**Drizzle plutôt que Prisma** :
- Migrations SQL **natives**, lisibles, versionnables en git sans artefacts binaires.
- Meilleur contrôle sur les migrations zero-downtime (2-phases) nécessaires à la durabilité 5+ ans.
- Typage très fort depuis le schéma TypeScript.
- Moins d'abstraction → plus facile de tomber sur du SQL standard en cas de problème.

**shadcn/ui plutôt que Mantine / MUI** :
- Composants **copiés dans le repo** (pas de dépendance NPM lourde) → contrôle total, pas de breaking change imposé par une lib.
- Accessible par défaut (Radix UI sous-jacent).
- Tailwind natif, pas de moteur CSS en runtime.

**PWA plutôt qu'app native** :
- 1 codebase, pas de comptes Apple (99€/an) ni Google Play (25€ à vie), pas de review Store.
- iOS et Android supportent le offline-first moderne (Service Worker, IndexedDB, Background Sync).
- Suffisant pour le pointage chantier (saisie d'heures, pas de caméra haute résolution ni GPS natif).

**Scaleway Serverless Containers plutôt que Vercel** :
- **Région Paris**, souveraineté FR.
- Pricing prévisible, support entreprise FR.
- Vercel acceptable pour démarrer mais le hébergement FR est une exigence explicite.

### Contraintes de simplification assumées

Pour rester maintenable à 1 personne :
- Pas d'architecture hexagonale stricte → **features folders Next.js** (colocation UI + logic + data par domaine).
- Pas de microservices → **monolithe Next.js**.
- Pas de Kubernetes → **containers managés**.
- Pas de Testcontainers au démarrage → tests unitaires sur règles métier seulement, E2E Playwright sur parcours critiques.
- OpenTelemetry complet reporté → **Sentry seul** en M0/M1.

## Conséquences

### Positives

- Onboarding rapide même pour un dev junior ou un non-développeur.
- Écosystème TypeScript unifié : une seule courbe d'apprentissage.
- Déploiement push-to-deploy.
- Économie d'ops massive (pas de K8s, pas de Keycloak, pas de broker).
- Exigences sécurité (HSTS, CSP, MFA, hashed passwords, RLS) couvertes en grande partie par le framework + Supabase.

### Négatives / Risques

- **Dépendance à Supabase** : si Supabase disparaît ou change radicalement sa politique. **Mitigation** : schéma Postgres standard, auth via JWT standard, on peut auto-héberger Supabase (open-source).
- **Next.js App Router encore jeune** : API stabilisée en v13 → v15 en 2 ans, possibles nouveaux paradigmes dans 2 ans. **Mitigation** : tenir à jour, suivre les release notes trimestrielles.
- **Drizzle moins mature que Prisma** : communauté plus petite, moins de tutoriels. **Mitigation** : fallback possible sur SQL natif à tout moment car Drizzle n'abstrait pas fortement.
- **shadcn/ui copie les composants dans le repo** : chaque upgrade demande un diff manuel. **Mitigation** : lister les composants utilisés, suivre le changelog mensuel.

## Alternatives considérées

1. **NestJS + Prisma + React/Vite + Keycloak** (proposition initiale) — rejetée : trop lourde pour 1 dev non-expert, triple la surface de maintenance, Keycloak demande une ops non-triviale.
2. **Laravel + Vue.js** — rejetée : ajoute PHP à la stack, moins d'écosystème BTP en TypeScript, effort d'apprentissage similaire.
3. **Python FastAPI + React** — rejetée : double langage, double tooling, pas de gain fonctionnel.
4. **Directus / Strapi headless** — rejetée : rigidité du schéma, logique métier BTP (compositions d'ouvrage, situations de travaux avec cumul/delta) trop complexe pour un admin UI généré.
5. **Pocketbase** — rejetée : SQLite peu adapté à la consistance transactionnelle BTP et aux volumes visés (chantiers sans limite).
6. **Budibase / Appsmith (low-code)** — rejetée : plafond fonctionnel, difficile à customiser pour offline-first et Factur-X.

## Révision

À revisiter si :
- Supabase change significativement de politique prix ou de région disponible.
- Next.js App Router montre une instabilité majeure dans les 12 prochains mois.
- L'équipe s'étoffe (>3 devs) : évaluer un découpage en services.
- Le besoin de temps réel (webhook, chat) devient majeur : évaluer Supabase Realtime plus avant.
