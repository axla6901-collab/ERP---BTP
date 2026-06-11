# Politique de sécurité

## Signalement d'une vulnérabilité

Si tu découvres une faille de sécurité, **ne crée pas d'issue publique**. Envoie un email à **aacosta@compte-r.com** avec :

- Description de la faille
- Étapes de reproduction
- Impact potentiel
- Version concernée

Réponse sous 72h ouvrées.

## Principes de sécurité

### Exigences

- **OWASP ASVS niveau 2** en cible pour toutes les surfaces HTTP/API.
- **RGPD** : traitement conforme, registre des traitements, durée de conservation définie par entité.
- **Pas de secrets en dur** : variables d'environnement uniquement, via secret manager en production.

### Authentification

- Hash de mots de passe : **argon2id** (géré par Supabase Auth).
- **MFA obligatoire** pour les rôles `admin`, `comptable`, `rh`.
- JWT courts (15 min) + refresh token en cookie `HttpOnly, Secure, SameSite=Strict`.
- Sessions révocables via table `sessions` côté serveur.

### Autorisation

- **RBAC** par rôle applicatif.
- **ABAC** contextuel (ex. chef de chantier n'accède qu'à ses chantiers).
- **RLS Postgres** activée sur toutes les tables sensibles.
- Politique par défaut : **deny all**, opt-in explicite.

### Entrées / Sorties

- **Validation stricte** de toute entrée avec Zod — rejet au moindre écart.
- **Requêtes paramétrées** via Drizzle. Aucune concaténation SQL.
- **Échappement contextuel** en sortie (React échappe par défaut ; ne jamais utiliser `dangerouslySetInnerHTML` sur donnée utilisateur).
- **CSRF** : tokens pour les mutations sensibles si cookies session.
- **CORS** restrictif : liste blanche d'origines en prod.

### En-têtes HTTP

Configurés dans `next.config.mjs` :

- `Strict-Transport-Security` (HSTS preload)
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` minimal
- **CSP stricte** à ajouter en M1 (nonces pour scripts, pas de `unsafe-inline`)

### Fichiers (documents chantier et administratifs)

- Validation **MIME côté serveur** (pas seulement extension).
- Taille max **20 Mo**.
- Anti-virus (ClamAV à ajouter en M5).
- Renommage aléatoire côté serveur.
- Stockage Supabase privé + **URLs présignées** courte durée.
- Hash SHA-256 stocké pour détection d'altération.

### Chiffrement des données sensibles (au repos)

Chiffrement **applicatif** (AES-256-GCM) des champs les plus sensibles, AVANT
écriture en base — un dump SQL volé ne les expose plus en clair.

- **Périmètre** : `employes` (`numero_secu`, `iban`, `bic`, `salaire_mensuel_brut`,
  `taux_horaire_brut`) et `entreprises` (`iban`, `bic`). Colonnes stockées en
  `bytea`. SIRET / TVA intracom **exclus** (identifiants publics, indexés/uniques).
- **Implémentation** : `lib/crypto/encryption.ts` (enveloppe versionnée
  `[version][keyId][iv][tag][ciphertext]`) + type de colonne Drizzle transparent
  `lib/crypto/encrypted-column.ts` (`encryptedText`). Le déchiffrement est
  automatique en lecture ; aucune requête ne filtre/agrège sur ces colonnes.
- **Audit** : les snapshots `audit_log.before/after` sont caviardés
  (`lib/audit/redaction.ts`) pour ne pas réintroduire le clair.
- **Clés (KMS auto-hébergé, sans SaaS tiers)** — variables d'environnement, jamais
  en base ni en dur :
  - `DATA_ENCRYPTION_KEYS` = liste `<id>:<base64-32-octets>` (virgules) — plusieurs
    clés permettent la rotation (l'id est embarqué dans chaque chiffré).
  - `DATA_ENCRYPTION_ACTIVE_KEY_ID` = id de la clé utilisée pour les nouveaux écrits.
  - Génération : `node scripts/generate-encryption-key.mjs`.
- **Rotation** : ajouter une nouvelle clé (nouvel id) à `DATA_ENCRYPTION_KEYS`,
  basculer `DATA_ENCRYPTION_ACTIVE_KEY_ID`, ré-chiffrer en tâche de fond, puis
  retirer l'ancienne clé une fois le corpus migré.
- **Déploiement initial** : cf. `docs/runbooks/chiffrement-champs-sensibles.md`
  (migrations 0067/0068 + backfill `scripts/encrypt-sensitive-backfill.ts`).

### Journalisation

- **Logs structurés JSON**, corrélation par `request_id`.
- **Ne jamais logger** : mots de passe, tokens, contenu de documents admin.
- **Audit métier** distinct des logs techniques (table `audit_log`).
- **Alertes** Sentry sur : pics 5xx, tentatives de login massives, accès admin hors horaires, expiration documents obligatoires.

### Dépendances

- **Scan automatique** en CI : `pnpm audit`, Dependabot.
- **CVE critique** : patch sous 48h.
- **CVE moyenne** : patch sous 7 jours.
- **Mise à jour mensuelle** de toutes les dépendances.
- **SBOM** (CycloneDX) généré à chaque release (M9).

### RGPD

- Registre des traitements dans `docs/rgpd/registre-traitements.md` (à créer M1).
- Durées de conservation par entité (employés, clients, sous-traitants, documents admin).
- **Export** des données personnelles sur demande (droit d'accès).
- **Suppression** sur demande, avec préservation des obligations légales (factures 10 ans).
- DPO à désigner côté métier avant mise en production.
