# Audit sécurité — pré-commercialisation

- **Date** : 2026-05-28
- **Périmètre** : ensemble du repo (Next.js 15, Better-Auth 1.6, Drizzle + Postgres, S3/MinIO)
- **Contexte** : préparation à la commercialisation de l'ERP BTP, exigence de chiffrement des données
- **Statut** : audit terminé, implémentation reportée

---

## Verdict global

Base solide (RLS très propre, Better-Auth + MFA, Zod systématique, headers OWASP partiels) mais **pas prête pour commercialisation** sans renforcement.

- **5 bloquants** avant mise en prod
- **6 risques importants** à traiter pendant la commercialisation
- **Aucun chiffrement applicatif** des données sensibles (RIB, IBAN, n° sécu, salaires)

---

## 🟢 Solide (à conserver)

| Domaine | État |
|---|---|
| RLS multi-tenant | 40 tables couvertes, `USING + WITH CHECK`, `FORCE RLS`, helper `withTenant()`, `assertRlsEnabled()` au boot, aucune fuite détectée |
| Rôles DB | `app_admin` (BYPASSRLS) / `app_migrator` / `app_rw` correctement séparés |
| Auth | Better-Auth 1.6 + MFA TOTP + backup codes + `requireAuthWithMfa` pour rôles `admin/comptable/rh` |
| Validation | Zod systématique sur les Server Actions (82 fichiers `'use server'`) + `safeParse` + fieldErrors |
| Sanitization | `isomorphic-dompurify` présent, aucun `dangerouslySetInnerHTML`, TipTap échappe par défaut |
| Headers HTTP partiels | HSTS 2 ans + preload, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy |
| Cookies | `__Secure-` prefix, `HttpOnly`, `SameSite` corrects |
| Audit log métier | Table `audit_log` avec before/after JSONB, index optimisés |
| Soft-delete systématique | `deleted_at` partout |
| Dépendances | Versions à jour (Next 15.5.18, React 19, better-auth 1.6.11, drizzle 0.45.2) |
| `.gitignore` | `.env*` exclus correctement, aucun secret commité |

---

## 🔴 Bloquants avant commercialisation

### B1. Aucun chiffrement applicatif des données sensibles

Champs en clair dans Postgres :

- `db/schema/employes.ts` : `numero_secu`, `iban`, `bic`, `salaire_mensuel_brut`
- `db/schema/` : SIRET, n° TVA intracom (entreprises, sous_traitants)
- `audit_log.before/after` (JSONB) recopie ces champs en clair → l'audit devient un vecteur d'exfiltration

**Impact** : dump SQL volé = tout exposé. Obligation RGPD pour le n° de sécu (art. 9 RGPD — donnée sensible).

### B2. Aucun rate-limiting (login / MFA / API)

- Pas de throttle sur `/api/auth/[...all]/route.ts` → brute-force libre
- TOTP = 1 M combinaisons, cassable en quelques minutes sans limite
- Pas de rate-limit global API → DoS applicatif trivial

### B3. CSP totalement absente

- `next.config.mjs` ne pose pas de `Content-Security-Policy`
- `SECURITY.md:52` le reconnaît : « CSP stricte à ajouter en M1 »
- Sans CSP : toute XSS exfiltre cookies/données librement

### B4. Aucun reset password

- Pas de flow `/forgot-password`, pas d'endpoint reset
- Utilisateur qui perd son mot de passe → ticket support manuel

### B5. Audit log d'authentification absent

- Aucune trace : login success, login fail, MFA fail, déconnexion, élévation de privilèges
- `session.ip_address` / `user_agent` stockés mais jamais lus
- Pas de trigger anti-UPDATE/DELETE sur `audit_log` → un attaquant peut effacer ses traces

---

## 🟠 Risques importants

### F1. Sessions : pas de gestion utilisateur

- Pas de page `/profile/sessions` (liste/révocation des sessions sur autres appareils)
- Pas de timeout idle (30 j de session continue par défaut Better-Auth)
- Durée explicite non configurée dans Better-Auth

### F2. Stockage S3/MinIO incomplet

- Pas de validation MIME stricte côté serveur (`contentType` client accepté tel quel)
- Pas de hash SHA-256 stocké pour vérifier l'intégrité
- Pas d'anti-virus (ClamAV mentionné M5)
- Pas de SSE bucket-side

### F3. RGPD : conformité incomplète

- Pas d'export données personnelles (droit d'accès)
- Pas d'anonymisation/hard-delete planifiés
- Registre des traitements pas créé (`SECURITY.md:80` indique « à créer M1 »)

### F4. Pas de scrubber sur Sentry

- Risque de fuite de tokens/RIB/IBAN dans les events Sentry/GlitchTip
- Pas de `beforeSend` filtrant les champs sensibles

### F5. Pas de tests d'isolation cross-tenant

- RLS robuste mais aucun test prouvant qu'Alice@A ne voit pas Bob@B
- Régression future passera inaperçue

### F6. CI sécurité minimale

- `pnpm audit --audit-level=high` présent ✓
- Manque : CodeQL, Dependabot/Renovate, SBOM CycloneDX, gitleaks

---

## 🟡 À planifier (renforcement continu)

- Politique mot de passe : 12 caractères OK, mais pas de blocklist (HIBP/k-anonymity)
- User enumeration sur `/api/auth` (erreurs distinctes `USER_NOT_FOUND` vs `INVALID_PASSWORD`)
- Pas de chiffrement disque documenté (LUKS Postgres / sauvegardes chiffrées)
- Pas de script de sauvegarde chiffrée
- mTLS app↔DB pas en place
- PDF générés sans watermark/signature
- Trigger anti-UPDATE/DELETE sur `audit_log` (immuabilité)

---

## Roadmap proposée

| # | Chantier | Effort | Priorité |
|---|---|---|---|
| 1 | Rate-limit auth + TOTP (Redis ou postgres-based) | 1 j | 🔴 |
| 2 | CSP avec nonces (Server Actions + scripts Next) | 1-2 j | 🔴 |
| 3 | Audit log auth (table dédiée + hooks Better-Auth + trigger immuabilité) | 1-2 j | 🔴 |
| 4 | Reset password (flow Better-Auth + UI + mail) | 1 j | 🔴 |
| 5 | Chiffrement applicatif champs sensibles (`lib/crypto/` AES-256-GCM + KMS, migration `iban/bic/numero_secu` en `bytea` chiffré) | 3-5 j | 🔴 |
| 6 | Sentry `beforeSend` scrubber | 0.5 j | 🟠 |
| 7 | Tests cross-tenant isolation (vitest + 2 users 2 entreprises) | 1 j | 🟠 |
| 8 | Gestion sessions utilisateur (page liste + révocation + idle timeout) | 1 j | 🟠 |
| 9 | Validation MIME + SHA-256 + SSE sur S3 | 1 j | 🟠 |
| 10 | RGPD : registre + export + anonymisation | 2-3 j | 🟠 |
| 11 | CI security : Dependabot + CodeQL + gitleaks + SBOM | 0.5 j | 🟡 |

**Total bloquants (1-5) : ~8-11 jours** avant commercialisation sereine.

---

## Ordre d'attaque recommandé

1. **#1 rate-limiting** — rapide, gros impact, débloque sereinement les autres chantiers
2. **#3 audit log auth** — préreq pour détecter les attaques pendant qu'on construit le reste
3. **#5 chiffrement applicatif** — le plus structurant ; le faire **après** avoir verrouillé le périmètre exact des colonnes à chiffrer ensemble (sinon on multiplie les migrations)

---

## Sources / fichiers consultés

- `package.json`, `next.config.mjs`, `middleware.ts`, `docker-compose.yml`, `SECURITY.md`
- `lib/auth/server.ts`, `lib/auth/guards.ts`, `lib/auth/tenant-guards.ts`, `lib/auth/rbac.ts`
- `db/schema/auth.ts`, `db/schema/audit.ts`, `db/schema/employes.ts`
- `db/migrations/0001_db_roles.sql`, `0037a_create_app_admin_role.sql`, `0043_rls_policies.sql`, `0051`, `0052`, `0053`
- `lib/db/client.ts`, `lib/db/with-tenant.ts`
- `lib/audit/log.ts`, `lib/storage/s3.ts`
- `app/api/auth/[...all]/route.ts`, `app/api/entreprise/switch/route.ts`
- `.github/workflows/ci.yml`
