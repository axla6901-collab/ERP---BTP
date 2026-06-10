# Runbook — Chiffrement des champs sensibles (déploiement initial)

Mise en œuvre du chiffrement applicatif AES-256-GCM des champs sensibles (audit
sécurité **B1**, RGPD). À l'issue, un dump SQL volé n'expose plus en clair :
`employes.{numero_secu, iban, bic, salaire_mensuel_brut, taux_horaire_brut}` ni
`entreprises.{iban, bic}`.

> SIRET / TVA intracom sont **exclus** (identifiants publics, indexés/uniques).
> Détails d'architecture : [`SECURITY.md`](../../SECURITY.md) §« Chiffrement des
> données sensibles ».

## Pièces concernées

| Fichier | Rôle |
|---|---|
| `lib/crypto/encryption.ts` | Primitive AES-256-GCM + trousseau de clés (env) |
| `lib/crypto/encrypted-column.ts` | Type Drizzle `encryptedText` (chiffre/déchiffre en transparence) |
| `lib/audit/redaction.ts` | Caviardage des champs sensibles dans `audit_log.before/after` |
| `db/migrations/0067_chiffrement_champs_sensibles_prep.sql` | Étape 1 — ajoute les colonnes `*_enc` + retire les CHECK regex |
| `scripts/encrypt-sensitive-backfill.ts` | Étape 2 — chiffre les lignes existantes (app_admin) |
| `db/migrations/0068_chiffrement_champs_sensibles_swap.sql` | Étape 3 — supprime le clair + renomme `*_enc` → final |

## Préalables

- Stack démarrée (cf. [`infra-locale.md`](infra-locale.md)), conteneur Postgres `erp-btp-postgres`.
- Comptes DB `app_migrator` (migrations) et `app_admin` / `DATABASE_ADMIN_URL`
  (backfill cross-tenant, BYPASSRLS) — cf. [`database-accounts.md`](database-accounts.md).
- **Clé de chiffrement générée et déployée AVANT toute écriture** (voir étape 0).
- ⚠️ `pnpm db:migrate` (drizzle-kit) ne fait rien ici (journal vide) : les
  migrations s'appliquent **manuellement** via `psql`, en tant qu'`app_migrator`.

## Étape 0 — Générer et déployer la clé

```powershell
# Génère une clé AES-256 (id 1) prête à coller dans .env.local
node scripts/generate-encryption-key.mjs
```

Coller la sortie dans `.env.local` (jamais commitée) :

```dotenv
DATA_ENCRYPTION_KEYS=1:<base64-32-octets>
DATA_ENCRYPTION_ACTIVE_KEY_ID=1
```

> Conserver une copie hors-repo. **La perte de la clé = perte irréversible** des
> champs chiffrés. En prod : coffre de secrets, pas `.env.local`.

Redémarrer l'app pour qu'elle charge les variables (`pnpm dev`, ou recréer le
conteneur applicatif en prod).

## Étape 1 — Migration de préparation (non destructive)

Ajoute les colonnes `*_enc` (bytea) **en parallèle** du clair et retire les CHECK
regex devenus incompatibles. Réversible (les colonnes clair restent intactes).

```powershell
Get-Content db/migrations/0067_chiffrement_champs_sensibles_prep.sql `
  | docker exec -i erp-btp-postgres psql -U app_migrator -d erpbtp
```

```bash
# équivalent bash
docker exec -i erp-btp-postgres psql -U app_migrator -d erpbtp \
  < db/migrations/0067_chiffrement_champs_sensibles_prep.sql
```

## Étape 2 — Backfill (chiffrement des lignes existantes)

Lit chaque valeur en clair (via `app_admin`/BYPASSRLS → exhaustif cross-tenant),
la chiffre, l'écrit dans la colonne `*_enc`. **Idempotent** (ne traite que
`*_enc IS NULL`) : relançable sans risque.

```powershell
pnpm tsx scripts/encrypt-sensitive-backfill.ts
```

À la fin, le script DOIT afficher :

```
✓ 0 valeur en clair restante — 0068 peut être appliquée.
```

Vérification seule (lecture seule, à rejouer autant que voulu) :

```powershell
pnpm tsx scripts/encrypt-sensitive-backfill.ts --check
```

> ⛔ Si le script sort en erreur (« N valeur(s) en clair restante(s) »),
> **NE PAS** passer à l'étape 3. Corriger (clé déployée ? `DATABASE_ADMIN_URL`
> correct ?) puis relancer.

## Étape 3 — Migration de bascule (DESTRUCTIVE)

Supprime les colonnes en clair et renomme `*_enc` → nom final. À l'issue, le
schéma SQL correspond exactement aux schémas Drizzle (`encryptedText`).

> **Prérequis absolus** : (1) étape 2 terminée sur « 0 valeur restante » ;
> (2) `DATA_ENCRYPTION_KEYS` / `DATA_ENCRYPTION_ACTIVE_KEY_ID` déployés sur l'app
> (sinon **toute lecture employé/entreprise échouera** après le swap).

```powershell
Get-Content db/migrations/0068_chiffrement_champs_sensibles_swap.sql `
  | docker exec -i erp-btp-postgres psql -U app_migrator -d erpbtp
```

## Vérification post-déploiement

1. `pnpm typecheck` et `pnpm test` → verts.
2. Ouvrir une fiche employé renseignée (`/<slug>/rh/employes/<id>`) : n° sécu,
   IBAN, salaire s'affichent **en clair** (déchiffrement transparent).
3. Modifier puis enregistrer un employé : pas d'erreur.
4. Générer un Factur-X d'une facture : l'IBAN émetteur figure bien dans le PDF/XML.
5. Contrôle base — les colonnes sont bien opaques :
   ```powershell
   docker exec erp-btp-postgres psql -U erpbtp -d erpbtp `
     -c "SELECT pg_typeof(numero_secu), left(encode(numero_secu,'hex'),16) FROM employes WHERE numero_secu IS NOT NULL LIMIT 1;"
   ```
   → type `bytea`, contenu illisible.
6. Audit — vérifier qu'`audit_log` ne contient pas de clair :
   ```powershell
   docker exec erp-btp-postgres psql -U erpbtp -d erpbtp `
     -c "SELECT after FROM audit_log WHERE table_name='employes' ORDER BY created_at DESC LIMIT 1;"
   ```
   → les champs sensibles valent `\"[chiffré]\"`.

## Rollback

- **Entre étape 1 et étape 3** : le clair est toujours présent. Revenir en
  arrière = repasser les colonnes Drizzle de `encryptedText` en `text`/`numeric`,
  puis `ALTER TABLE … DROP COLUMN …_enc`. Aucune donnée perdue.
- **Après étape 3** : irréversible côté schéma. La donnée n'existe plus qu'en
  chiffré → restaurer depuis une sauvegarde si nécessaire. **Ne jamais perdre la
  clé** : sans elle, la donnée chiffrée est définitivement illisible.

## Rotation de clé (ultérieure)

1. Générer une clé avec un **nouvel id** : `node scripts/generate-encryption-key.mjs 2`.
2. **Ajouter** (sans retirer l'ancienne) à `DATA_ENCRYPTION_KEYS`, p. ex.
   `DATA_ENCRYPTION_KEYS=1:<k1>,2:<k2>`, puis `DATA_ENCRYPTION_ACTIVE_KEY_ID=2`.
3. Re-chiffrer le corpus : un `UPDATE` qui relit/réécrit chaque ligne suffit (la
   lecture déchiffre avec la clé d'origine, l'écriture re-chiffre avec la clé
   active). L'id de clé est embarqué dans chaque chiffré → cohabitation possible.
4. Une fois tout le corpus en clé 2, retirer la clé 1 de `DATA_ENCRYPTION_KEYS`.

Cf. aussi [`rotation-secrets.md`](rotation-secrets.md).
