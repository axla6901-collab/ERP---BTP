# ADR-007 — Observabilité auto-hébergée (GlitchTip)

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta

## Contexte

Le projet a besoin d'une **plateforme de monitoring d'erreurs et de performance** pour :
- Diagnostiquer les bugs en prod (un utilisateur ne peut pas décrire un stack trace au téléphone)
- Suivre les régressions de performance (temps de réponse des Server Actions, requêtes SQL lentes)
- Auditer les comportements suspects (tentatives de connexion répétées, erreurs RBAC inattendues)

L'[ADR-001](001-stack.md) prévoyait **Sentry SaaS**. Mais l'[ADR-006](006-stack-autonome.md) a établi le principe d'**autonomie totale** (refus de tout fournisseur tiers identifiable). Sentry SaaS est donc exclu.

## Décision

Utiliser **GlitchTip**, un clone open-source de Sentry, **auto-hébergé via Docker**.

- **Code applicatif** : `@sentry/nextjs` (SDK Sentry officiel). 100 % compatible GlitchTip côté protocole.
- **Backend** : GlitchTip Docker Compose séparé (`docker-compose.glitchtip.yml`, 4 conteneurs : web, worker, postgres, redis).
- **DSN** : pointe vers `http://localhost:8000` en dev, vers un GlitchTip prod en prod (à formaliser plus tard).
- **No-op si DSN vide** : le SDK ne fait rien quand `SENTRY_DSN` est vide, ce qui permet de **développer sans GlitchTip démarré** (économie de RAM).

### Pourquoi pas Sentry SaaS

Cohérence ADR-006 : refus de tout fournisseur tiers identifiable, y compris pour des données dérivées (stack traces, breadcrumbs) qui peuvent contenir des informations sensibles (URLs, headers, fragments JSON).

### Pourquoi pas écrire son propre système

Re-implémenter un système d'observabilité (collecteur, dédoublonnage, UI, recherche, alertes) = effort démesuré pour un dev solo. GlitchTip apporte des années de maturité Sentry-like clé en main.

### Pourquoi pas OpenTelemetry + Jaeger/Loki

Stack plus moderne mais beaucoup plus complexe à opérer (4-6 conteneurs supplémentaires, configuration fine). À envisager si le projet grossit (>3 devs) ou si les traces distribuées deviennent utiles (post M6).

## Conséquences

### Positives

- **Autonomie** : aucune donnée erreur ne quitte la machine de l'utilisateur
- **Coût** : gratuit (open-source, RAM = ressource locale)
- **Code applicatif identique** : si demain on bascule vers Sentry SaaS ou autre clone (Bugsink, etc.), changement = 1 variable d'env
- **Démarrage à la demande** : GlitchTip est lourd ; on l'éteint quand on n'en a pas besoin (`docker compose -f docker-compose.glitchtip.yml stop`)

### Négatives / Risques

- **4 conteneurs Docker supplémentaires** : ~1 Go RAM, démarrage 30-60 s
- **GlitchTip moins mature que Sentry** : moins de plugins, certaines features Sentry absentes (Performance Insights avancés, profiling continu, etc.). Suffisant pour la portée erp-btp
- **Maintenance** : il faut suivre les releases GlitchTip et upgrader manuellement
- **Backups** : GlitchTip postgres + uploads à sauvegarder (à formaliser en M2+ avec `backup-restore.md`)

### Mitigations

- Runbook complet [`observabilite.md`](../runbooks/observabilite.md) couvre setup, mise en pause, reset, désinstallation
- DSN vide = SDK no-op : aucun blocage en dev si GlitchTip n'est pas démarré
- `withSentryConfig` est silencieux quand DSN absent (pas d'upload de source maps inutile)

## Alternatives considérées

1. **Sentry SaaS** — voir contexte, exclu par ADR-006
2. **Bugsink** — alternative GlitchTip plus récente, moins mature au moment de la décision (2026-05). Réévaluer en M3+ si elle gagne en traction
3. **Highlight.io self-hosted** — orienté session replay, lourd, scope plus large que nécessaire
4. **Custom logger + log aggregator (Loki)** — simple mais perd les fonctionnalités Sentry-like (dédoublonnage, breadcrumbs, source maps, releases)
5. **OpenTelemetry + Jaeger** — voir section décision

## Révision

À revisiter si :
- GlitchTip annonce sa fin ou un changement majeur de licence
- Le besoin de traces distribuées devient critique → évaluer OpenTelemetry
- L'équipe s'étoffe et un GlitchTip mutualisé entreprise devient justifiable
