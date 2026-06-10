# Roadmap

## Vision

Construire un ERP Bâtiment modulaire **au fil de l'eau**, un domaine à la fois, sans régression, maintenable par 1 personne sur 5+ ans.

**Principes** :
- Chaque itération livre une valeur métier **utilisable en production**.
- Aucun module ne casse les précédents (migrations rétro-compatibles).
- Documentation et tests au même niveau que le code.

---

## Jalons

### ✅ M0 — Fondations documentaires

**État** : terminé (2026-04-21)

- Arborescence du projet
- ADR 001-005 (stack, user/employé, numérotation, offline pointage, export compta)
- Configuration outillage (TypeScript strict, Next.js 15, Tailwind, Drizzle, Vitest, Playwright)
- Documentation (README, ROADMAP, architecture, MCD mapping, SECURITY, CONTRIBUTING)

**Livrable** : `pnpm dev` fonctionne et affiche une page d'accueil.

---

### 🟡 M1.1 — Itération 0a : Socle d'authentification (✅ livré 2026-05-21)

> Stack mise à jour le 2026-05-21 vers une stack autonome (Postgres + MinIO + Mailpit + Better Auth). Voir [ADR-006](adr/006-stack-autonome.md).

**Schéma DB livré**
- `user`, `session`, `account`, `verification`, `two_factor` (gérés par Better Auth)
- `utilisateurs` (RBAC + lien FK vers `user.id` — ADR-002 révisé)
- Enum `role_utilisateur` avec 8 rôles

**Code livré**
- Better Auth configuré (email + password + verification + plugin 2FA)
- `databaseHooks` : sync `user` ↔ `utilisateurs`, MAJ `derniere_connexion_at` à chaque connexion
- `middleware.ts` : redirection `/profile` et `/dashboard` vers `/login` si pas de session
- Guards `getSession()`, `getCurrentUtilisateur()`, `requireAuth(role?)`
- shadcn/ui initialisé (Button, Input, Label, Card, Form, Sonner, Alert)
- Pages `/login`, `/signup`, `/verify-email`, `/dashboard`, `/profile`
- Bouton « Se déconnecter »
- Mail capture via Mailpit local

**Table `employes`** : créée en M5 (RH & pointage) ; pour l'instant `utilisateurs.employe_id = NULL`.

---

### 🟢 M1.2 — Itération 0b : Concerns transverses + sécurité avancée (✅ livré 2026-05-21)

**Schéma DB livré**
- Comptes Postgres séparés `app_migrator` (DDL) et `app_rw` (DML seulement) — cf. [`db/migrations/0001_db_roles.sql`](../db/migrations/0001_db_roles.sql)
- Table `audit_log` (JSONB before/after, FK `utilisateurs`) — append-only via helper `lib/audit/log.ts`
- Trigger `trg_utilisateurs_updated_at` + fonction `trigger_set_updated_at()` (à appliquer à chaque future table M2+)
- Table `numeros_attribues` + fonction `generate_numero(type)` (ADR-003)

**Code livré**
- Helpers `lib/db/helpers.ts` : `notSoftDeleted()`, `softDelete()` (avec écriture audit transactionnelle)
- Helper `lib/numbering/generate.ts` + tests Vitest
- MFA TOTP : pages `/profile/mfa`, `/profile/mfa/setup`, `/two-factor`, bandeau d'alerte dashboard pour les rôles `ROLES_MFA_OBLIGATOIRE` sans MFA active
- Magic link : `lib/auth/server.ts` étendu avec plugin `magicLink`, onglet « Lien magique » dans `/login`, page `/magic-link-sent`
- Observabilité : `@sentry/nextjs` configuré (no-op si DSN vide), `withSentryConfig` wrap `next.config.mjs`, `docker-compose.glitchtip.yml` séparé pour GlitchTip self-hosted ([ADR-007](adr/007-observabilite.md))

**Qualité de code**
- `git init` du projet (était hors versionning)
- Lefthook installé : `pre-commit` (prettier + eslint sur staged files), `pre-push` (typecheck + tests)
- `pnpm check` zéro erreur
- Tests Vitest verts (8 tests sur `lib/numbering`)

**Documentation**
- Runbooks `database-accounts.md`, `observabilite.md`, `rotation-secrets.md` (M1.2)
- [ADR-007](adr/007-observabilite.md) — observabilité auto-hébergée

---

### 🟢 M1.3 — Itération 0c : Durcissement et qualité du socle (✅ livré 2026-05-21)

**Sécurité avancée**
- **Forçage strict MFA** : `requireAuthWithMfa()` ajouté dans `lib/auth/guards.ts`. Toute page métier (`dashboard`, `profile`) appliquée. Les rôles `admin`/`comptable`/`rh` sans MFA sont automatiquement redirigés vers `/profile/mfa/setup` — plus de bandeau d'alerte non-bloquant.
- **`autoSignInAfterVerification: true`** sur Better Auth : un signup + clic sur le lien email atterrit directement sur le dashboard (UX simplifiée, pas de re-login manuel).

**Outils admin**
- **Script `bootstrap-admin`** (`scripts/bootstrap-admin.ts`) : `pnpm bootstrap:admin <email>` promeut en `admin`. Cas couverts : email inexistant, compte désactivé, déjà admin (idempotent). Runbook `user-management.md` mis à jour.

**Tests E2E**
- 3 tests Playwright dans `tests/e2e/auth.spec.ts` :
  - signup → email Mailpit → vérification → dashboard
  - login compte existant → logout → redirect `/login`
  - accès `/profile` sans cookie → redirect `/login`
- Helpers `tests/e2e/helpers/mailpit.ts` (API Mailpit)
- `tests/e2e/README.md` : pré-requis et conventions

**CI**
- Workflow `.github/workflows/ci.yml` validé : `lint` + `typecheck` + `test` + `build` + `pnpm audit --prod`
- Runbook `ci-deploy.md` : procédure de branchement GitHub à activer quand prêt (aucun remote push en M1.3)

**Choix techniques**
- **OAuth Google abandonné** (cohérent avec autonomie/confidentialité — Google = fournisseur tiers identifiable)

**Reporté en M1.4** (ou jamais)
- IdP self-hosted type Keycloak/Authentik (à réévaluer si l'app a plusieurs satellites)
- Déploiement automatique en prod (M6+)
- Branchement GitHub Actions réel (à faire quand le repo distant sera créé)

---

### 🟢 M3.1 — Module commercial : clients + devis multi-lignes (✅ livré 2026-05-21)

**Schémas DB** (cf. [ADR-010](adr/010-devis-multi-lignes.md))
- `clients` (union discriminée particulier/pro, CHECK SQL, SIRET/TVA validés)
- `devis` (en-tête + cache totaux HT/TVA/TTC + JSONB `details_tva` par taux)
- `lignes_devis` (3 types : section / article_catalogue / libre, CHECK conditionnels)

**Calculs**
- `lib/commercial/calculs.ts` : `calculerTotauxDevis(lignes)` pure et testée (5 tests Vitest)
- Réutilisé serveur (persistance cache) + client (preview live `<TotauxDevis>`)

**Server Actions**
- `lib/commercial/{clients,devis,permissions,calculs}.ts`
- Numérotation via `generate_numero('devis')` → `D-2026-000XXX`
- Transitions de statuts contrôlées : `brouillon → envoye → accepte|refuse|expire`
- Suppression devis uniquement en `brouillon` (cohérence fiscale)

**UI**
- 3 onglets `/commercial` : Aperçu / Clients / Devis
- CRUD clients avec form discriminé particulier/pro
- `<DevisEditor>` : useFieldArray multi-types (sélecteur de type par ligne, auto-remplissage depuis article catalogue)
- `<TotauxDevis>` : calcul live JS + détail par taux de TVA
- `<ChangerStatut>` : boutons selon transitions possibles

**Lien header global** : « Commercial » entre « Catalogue » et le profil utilisateur

**Reporté en M3.2**
- Auto-liquidation BTP automatique (flag sur client pro + ajout mention conditions)
- Clonage de devis (créer un nouveau à partir d'un existant)
- Génération PDF (Puppeteer ou react-pdf)
- Envoi par email avec suivi
- Lien chantier → M4 (workflow accepte → création auto chantier)
- Factur-X complet → M6 facturation

---

### 🟡 M2 — Itération 1 : Bibliothèque de prix

**Estimation** : 2-3 semaines dev expérimenté, **1-2 mois** pour solo non-dev.

**Périmètre MCD** : `FAMILLE_OUVRAGE`, `OUVRAGE`, `COMPOSITION_OUVRAGE`, `FAMILLE_ARTICLE`, `ARTICLE`, `TARIF_FOURNISSEUR`, `FOURNISSEUR` (partiel — seulement pour les tarifs).

**Livrable total**
- CRUD complet familles / articles / ouvrages
- Composition d'ouvrage avec **calcul de prix dynamique** depuis les tarifs fournisseurs actifs
- Historisation des tarifs fournisseur (période validité)
- Vue matérialisée `ouvrages_prix_calcules` rafraîchie à la modification d'un tarif
- Import CSV (articles et tarifs) pour faciliter le peuplement initial
- Seeds : corps de métier, quelques familles exemples

---

### ⚠ M2.1 — Socle catalogue + CRUD familles/articles (REMPLACÉ par M2.1-bis)

> Modèle initial : familles_ouvrage + familles_article + articles (à plat) + ouvrages + compositions_ouvrage. Refondu intégralement le 2026-05-21 selon le prompt « Articles Composés » (cf. ADR-008). Données migrées sans perte vers le nouveau modèle.

### 🟢 M2.2 — BOM versionnée + prix historisés multi-fournisseurs (✅ livré 2026-05-21)

**Schémas DB** (cf. [ADR-009](adr/009-bom-versionnee-prix-historises.md))
- `nomenclatures` (versions immutables, index unique partiel `WHERE valid_to IS NULL`)
- `nomenclature_lignes` (composant + quantité + unité d'emploi + coefficient de perte)
- `prix_articles` (multi-fournisseurs : référence générique + N prix par fournisseur)
- `articles.fournisseur_prefere_id` (FK optionnelle)

**Fonctions PostgreSQL**
- `prix_courant_article(article, date)` — règle de sélection (préféré → référence → moins cher)
- `bom_explode(article, date)` — CTE récursive multi-niveaux
- `bom_cost_roll(article, date)` — prix de revient récursif avec liste des manquants
- `bom_where_used(article)` — recherche inverse
- Trigger `check_bom_cycle()` anti-cycle (profondeur max 8)

**Server Actions**
- `lib/catalogue/{fournisseurs,nomenclatures,prix-articles,bom}.ts`
- Transactions Drizzle + audit_log + revalidation paths

**UI**
- 5e onglet « Fournisseurs » dans `/catalogue` (CRUD)
- Page `/catalogue/articles/[id]/composition` — éditeur de BOM avec versioning (useFieldArray)
- Page `/catalogue/articles/[id]/prix` — tableau multi-fournisseurs + sélecteur de fournisseur préféré + form prix
- Liste `/catalogue/articles` enrichie d'une colonne **Prix** (calcul automatique pour composés via `bom_cost_roll`)
- Section composition + prix de revient dans le détail d'un article composé

**Tests**
- 27 tests Vitest verts (8 numbering + 19 catalogue dont 10 ajoutés pour M2.2)

**Reporté en M2.4**
- Seeds BTP étendus (familles types + corps de métier)
- Import CSV articles + prix
- Vue matérialisée `articles_avec_prix` pour les listes volumineuses
- Conversion automatique d'unités cross-type (M² ↔ KG via densité)

---

### 🟢 M2.1-bis — Refonte selon prompt Articles Composés (✅ livré 2026-05-21)

**Modèle DB (cf. [ADR-008](adr/008-catalogue-articles-composes.md))**
- `unites` (référentiel + seed BTP) + `unite_conversions` (avec trigger anti cross-type)
- `familles` (hiérarchique récursive, parent_id, profondeur max 5, trigger anti-cycle)
- `articles` (table unifiée avec `type` ∈ {simple, compose, prestation, operation}, triple unité, caractéristiques physiques)
- Migration `db/migrations/0006_catalogue_refonte.sql` (seed unités + migration data + renommage legacy)

**Code applicatif**
- `lib/validation/catalogue.ts` réécrit (schémas `unite`, `famille`, `article`, libellés type)
- `lib/catalogue/{familles,articles,unites}.ts` : Server Actions CRUD complet avec audit + soft delete
- `components/catalogue/{famille-form,article-form,unite-form}.tsx` : formulaires shadcn refondus
- Pages `/(app)/catalogue/{familles,articles,unites}/{,nouveau,[id]}` toutes opérationnelles
- Layout 4 onglets : Aperçu / Familles / Articles / Unités

> **Note (juin 2026)** — la gestion des unités a depuis été déplacée vers
> `/(app)/administration/unites` (menu Administration, réservé au rôle `admin`).
> La lecture du référentiel (`listerUnites`) reste partagée par le catalogue, le
> commercial et la facturation. Le catalogue conserve Familles et Articles.

**Reporté à M2.2**
- Nomenclatures (BOM récursive + versioning + validités temporelles)
- Fonctions PG `bom_explode`, `bom_cost_roll`, `bom_where_used`, trigger anti-cycle BOM
- UI édition de la BOM d'un article composé

**Reporté à M2.3**
- Refonte `prix_articles` (historique par valid_from/valid_to + lien fournisseur)
- Calcul prix de revient d'un composé via BOM × prix actifs

**Schémas DB**
- 7 tables M2 créées (familles_ouvrage, familles_article, articles, ouvrages, compositions_ouvrage, fournisseurs, tarifs_fournisseur) avec triggers `updated_at`, soft delete, CHECK contraintes, index partiels (unicité du `code` filtrée sur lignes non supprimées)
- Migration SQL `db/migrations/0005_catalogue_tables.sql` appliquée via `app_migrator`

**Validation**
- `lib/validation/catalogue.ts` : schémas Zod réutilisables (`codeMetier`, `libelleMetier`, `prixUnitaireHt`) + 9 tests Vitest verts

**Server Actions**
- `lib/catalogue/{familles-ouvrage,familles-article,articles}.ts` : CRUD complet (lister/lire/créer/modifier/supprimer)
- Audit log automatique sur chaque mutation (transaction Drizzle)
- RBAC : seuls `admin`, `conducteur_travaux`, `acheteur` peuvent muter (cf. `lib/catalogue/permissions.ts`)
- Soft delete via update `deleted_at = now()`
- Gestion erreurs FK (suppression refusée si dépendances)

**UI**
- Module `/(app)/catalogue/` avec layout + onglets (Aperçu, Familles ouvrage, Familles article, Articles)
- Dashboard avec compteurs (`COUNT(*)` sur chaque table)
- 9 pages CRUD (3 entités × liste / nouveau / [id])
- Composants partagés `<FamilleForm>`, `<ArticleForm>`, `<DeleteButton>` (avec confirmation inline)
- Lecture seule pour les autres rôles (boutons « Modifier / Supprimer » masqués)
- Lien « Catalogue » dans le header global
- Composants shadcn ajoutés : `table`, `textarea`, `switch`, `select`

**Reporté en M2.2/M2.3/M2.4**
- M2.2 : ouvrages composés + compositions + calcul prix dynamique + vue matérialisée
- M2.3 : fournisseurs + tarifs historisés + écrasement prix article par tarif actif
- M2.4 : seeds (corps de métier, familles types BTP) + import CSV

---

### M3 — Itération 2 : Commercial

**Estimation** : 3 semaines / **1-2 mois** solo.

**Périmètre MCD** : `CLIENT`, `DEVIS`, `LIGNE_DEVIS`.

**Livrable**
- Saisie devis avec lignes ouvrage OU article (XOR contraint)
- Calcul HT/TTC avec TVA, gestion auto-liquidation BTP (art. 283-2 nonies CGI)
- Statuts devis (brouillon → envoyé → accepté → refusé)
- **Génération PDF devis** (template HTML → PDF via Puppeteer ou react-pdf)
- Champs Factur-X pré-câblés dans `devis` et `factures` (SIRET émetteur, IBAN, conditions)
- Workflow **devis accepté → création automatique du chantier**

---

### 🟢 M5.5 — Pointage offline (PWA) (✅ livré 2026-06-10)

> Cf. [ADR-004](adr/004-offline-pointage.md) (architecture) + [ADR-015](adr/015-pwa-sw-manuel.md) (Service Worker écrit à la main, pas de Workbox — compat Turbopack). Runbook : [pwa-deployment.md](runbooks/pwa-deployment.md).

**Schéma DB** (migration 0061)
- `pointages.client_uuid` (UUID v7, idempotency key) + index unique non partiel `uq_pointages_client_uuid`
- `pointages.server_received_at` (horodatage serveur de réception)

**PWA installable**
- `app/manifest.ts` (`/manifest.webmanifest`) + icônes SVG (`any` + `maskable`), `theme_color` amber, `appleWebApp`
- `middleware.ts` : `sw.js` / `manifest.webmanifest` / `icons` exclus du redirect auth
- Service worker **manuel** `public/sw.js` : NetworkFirst (navigation + refs), CacheFirst (statics), fallback hors-ligne inline, Background Sync `sync-pointages`, MAJ contrôlée par bannière (skipWaiting)

**Outbox & sync**
- `lib/pwa/outbox.ts` (IndexedDB via `idb`) : enqueue optimiste, flush idempotent, purge 30 j ; contrat de schéma partagé avec le SW (IDB natif)
- `POST /api/v1/pointages` idempotent (`ON CONFLICT (client_uuid) DO NOTHING`), batch, résultats `synced`/`duplicate`/`rejected` (doublon métier / référence supprimée / données invalides)
- `GET /api/v1/pointage-refs` : employés actifs + chantiers en cours + tâches (caché par le SW)
- `lib/pwa/sw-register.tsx` : enregistrement (prod uniquement), bannière de MAJ, flush au retour réseau (fallback iOS)

**UI terrain**
- `components/rh/pointage-terrain.tsx` : écran mobile-first (gros boutons, raccourcis heures, indemnités, bandeau online/offline, file d'attente + statuts)
- Page `/rh/pointages/terrain` + bouton « Pointage terrain » sur la liste des pointages

**Tests** : 11 tests Vitest (schéma sync, classification erreurs PG, construction du payload). Build Turbopack vert, 716 tests verts.

**Reporté / hors périmètre**
- Icônes PNG `apple-touch-icon` iOS (polish), chiffrement IndexedDB (M10), alerte RH sur pointages non synchronisés > 30 j, saisie « équipe » multi-employés en un écran, photo offline.

---

### 🟢 M5.4 — Dossier employé BTP complet (✅ livré 2026-05-21)

> Cf. [ADR-014](adr/014-dossier-employe-complet.md). Couvre identité civile, adresse, contact urgence, famille, paie, médical, carte BTP, habilitations, permis et documents.

**Schémas DB** (migration 0013)
- Table `employes` portée à ~50 colonnes : identité civile (date/lieu naissance, n° sécu CHECK 13-15, sexe, nationalité), adresse perso (CHECK CP 5 digits), contact urgence (nom/tel/relation), famille (situation_familiale enum, nombre_enfants CHECK 0-20), contrat (matricule UNIQUE partiel, dates embauche/fin/sortie, coefficient, classification enum, salaire mensuel, convention), banque (IBAN CHECK format ISO, BIC), médical (dates visite, aptitude enum), carte BTP (numéro, validité)
- Table `employe_habilitations` : enum couvrant CACES R482 (A→G), R489 (1A/1B/3/5/6), AIPR (3 niveaux), électrique (B0/BE/B1V/B2V/BR/BC/HF), SST + dates obtention/validité
- Table `employe_permis` : 10 catégories (B→DE), UNIQUE partiel (employe, categorie)
- Table `employe_documents` : 15 types (CV, photo, contrats, attestations, justificatifs, RIB, carte BTP, diplômes…), métadonnées + clé MinIO + date de validité

**Server Actions** (`lib/rh/`)
- `employes.ts` étendu (50+ champs en `buildValues`)
- `habilitations.ts`, `permis.ts` — CRUD avec audit log par mutation
- `employe-documents.ts` — `preparerUploadDocument` (presigned URL MinIO, max 25 Mo), `enregistrerDocument` (insert métadonnées), `urlTelechargementDocument` (download presigné), `supprimerDocument` (soft)

**UI**
- `<EmployeForm>` refondu en **8 sections accordéon HTML natif** (identité pro / civile / coordonnées / famille / banque / médical / carte BTP / notes) avec save bar collante en bas
- `<HabilitationsList>` + `<PermisList>` : table inline avec badge statut (Valide / J-30 / Expirée / Expiré) calculé live à partir de `date_validite`
- `<DocumentsList>` : upload via presigned URL (PUT direct MinIO sans transit Server Action), download via presigned URL, suppression soft
- Page `/rh/employes/[id]` : form complet + 3 cards (habilitations / permis / documents) + bouton suppression

**Reporté en M5.5** (PWA / offline)
- Service worker + IndexedDB outbox
- Mobile-first / écran terrain pointage

**Reporté en M9** (documents administratifs entreprise)
- Job d'alertes échéances 30/15/7 jours sur habilitations/permis/documents/visites
- Factorisation table `documents` (employes + chantiers + entreprise)
- Chiffrement at-rest pour n° sécu et IBAN
- Purge MinIO selon politique de rétention RGPD

---

### 🟢 M5.3 — Import / Export pointages (✅ livré 2026-05-21)

**Migration data** (`scripts/import-pointage.ts` exécutable via `pnpm tsx`)
- Reprise complète du projet `Pointage` (React/Vite/Electron) : 132 employés, 147 chantiers, 22 894 pointages sur 2023-2026
- Parsing du format legacy `"NOM Prénom - Type - Société"` (collab) et `"Ville - Client - Zone"` (chantier)
- Création automatique d'un client générique « PTG-HIST » pour les chantiers historiques
- Mapping `type_document` (15 valeurs) et `motif_absence` (14 valeurs) sur enums Postgres

**Enums étendus** (migration 0012)
- `type_pointage` : ajout des budgets (`budget_heures`, `budget_kg_acier_*`, `budget_m3_beton_*`) et % avancement (`pct_avancement_*`)
- `motif_absence` : ajout vacances / intempérie / naissance / mariage / décès / école / SPOU / JPS

**UI**
- Nouvel onglet « Import » dans `/rh`
- `/rh/import` : drag & drop d'un fichier `.json` (format Pointage), `.xlsx`, `.xls` ou `.csv`
- Détection automatique du format, preview du résultat (nb employés/chantiers créés + lignes importées + skipped)
- Bouton « Exporter CSV » sur `/rh/pointages` avec BOM UTF-8 + séparateur `;` (Excel-friendly fr-FR)

**Server Actions** (`lib/rh/import-export.ts`)
- `importerJsonPointage(text)` — parse + insert batch (500/transaction) avec idempotence par clé canonique
- `importerExcelPointage(bytes)` — réutilise `xlsx` pour lire Excel/CSV, mappe vers le format JSON, délègue au pipeline JSON
- `exporterPointagesCSV(filtres)` — produit le CSV streamable côté client

**Reporté en M5.4** (Budget Pro)
- Comparaison budget vs réel par chantier sur les 5 dimensions
- Calcul du % d'avancement à partir des données importées
- Dashboard stats avec recharts

**Reporté en M5.5** (PWA / offline)
- Service worker + IndexedDB outbox
- Mobile-first / écran terrain
- Sync background

---

### 🟢 M5.1 + M5.2 — RH + Pointage (socle + matrice mensuelle) (✅ livré 2026-05-21)

> Inspiré du projet `Pointage` (React/Vite/Electron) en usage par l'utilisateur. Données normalisées en tables relationnelles (FK vers `chantiers`).

**Schémas DB** (cf. [ADR-013](adr/013-rh-pointage-socle.md))
- Table `employes` : nom, prénom, type_contrat enum (CDI/CDD/INT/ALT/STAGE), société d'intérim (obligatoire si INT via CHECK), qualification, taux horaire brut, heures hebdo, zone déplacement, dates entrée/sortie, contact, audit + soft delete
- Table `pointages` : employe_id FK, chantier_id FK (NULL si absence), chantier_tache_id FK NULL, date, type enum (heures + 4 budget + absence), quantité > 0, motif_absence enum NULL, zone déplacement, indemnités (panier, grand panier, nuit), audit + soft delete
- Enums : `type_contrat`, `zone_deplacement`, `type_pointage`, `motif_absence`
- FK `utilisateurs.employe_id` activée (placeholder M1.1 → vraie FK)
- UNIQUE partiel `(employe, date, chantier, type)` avec COALESCE pour les absences

**Server Actions** (`lib/rh/`)
- CRUD employés (`creerEmploye`, `mettreAJourEmploye`, `supprimerEmploye` soft, `listerEmployesActifs`)
- Pointages : `listerPointagesMois`, `creerPointage`, `supprimerPointage`, `saisirMatricePointages` (transactionnel, soft-delete + INSERT atomique du mois)
- Permissions : `ROLES_RH_WRITE = ['admin','rh','comptable']` ; `ROLES_POINTAGE_WRITE` ajoute conducteur_travaux + chef_chantier

**UI**
- Lien « RH » dans le header global
- `/rh` avec 4 onglets : Aperçu / Employés / Pointages / Saisie matrice
- Dashboard avec 3 tuiles : employés actifs, pointages du mois, heures du mois
- `<EmployeForm>` discriminé (champ société d'intérim conditionnel)
- `<PointageMatrice>` : tableau collaborateur × jours avec sélecteur mois/année, total ligne + total mois, gestion type=absence (cache chantier, force motif)
- Liste pointages filtrée par mois/année

**Reporté en M5.3**
- Import multi-formats (Excel/CSV minimum, PDF/Word selon besoin réel)
- Export CSV/Excel pour paie

**Reporté en M5.4**
- Budget Pro : comparaison budget vs réel par chantier sur les 5 types (heures + aciers + bétons)
- Stats par employé (dashboard recharts)

**Reporté en M5.5**
- PWA configurée (manifest, service worker via Workbox)
- IndexedDB + outbox pattern (ADR-004)
- Sync background (Background Sync API + fallback)
- Mobile-first / écran terrain

---

### 🟢 M4.2 — Tâches du chantier (✅ livré 2026-05-21)

**Schémas DB** (cf. [ADR-012](adr/012-taches-chantier.md))
- Enum `statut_tache` : a_faire / en_cours / bloque / termine / annule
- Table `chantier_taches` (ordre, libellé, responsable_id, statut, avancement %, dates prévues + réelles, audit + soft delete)

**Server Actions** (`lib/chantiers/taches.ts`)
- CRUD complet + `changerStatutTache` + `mettreAJourAvancement` + `deplacerTache` (↑/↓)
- Transitions guardées + auto-remplissage des dates réelles + avancement 100 % à `termine`
- Création : `ordre = max(ordre)+1` dans la transaction

**UI**
- Section `<ChantierTaches>` intégrée à la page détail chantier
- Tableau avec progress bar par tâche, badge statut, boutons rapides (édition inline, ↑/↓, statuts, suppression)
- Form compact réutilisable `<TacheForm>` pour ajouter / éditer
- Indicateur d'avancement moyen du chantier (calculé côté UI, hors tâches annulées)

**Reporté en M4.3**
- Documents chantier (plans, PV, PPSPS, photos) via MinIO
- Dépendances entre tâches (Gantt léger : M10 si jamais)
- Drag & drop pour réordonner (M10)
- Vue matérialisée `chantier_avancement` si besoin perf en reporting

---

### 🟢 M4.1 — Module chantiers : socle + workflow devis→chantier (✅ livré 2026-05-21)

**Schémas DB** (cf. [ADR-011](adr/011-module-chantiers.md))
- Table `chantiers` (libellé, client_id FK, responsable_id FK→utilisateurs, statut enum, dates prévues + réelles, montant prévisionnel, adresse chantier, audit + soft delete)
- Enum `statut_chantier` : prospect / en_cours / suspendu / termine / annule
- Activation FK `devis.chantier_id` (placeholder M3.1 → vraie FK ON DELETE SET NULL)
- Extension `generate_numero('chantier')` → préfixe `CH`

**Server Actions** (`lib/chantiers/`)
- CRUD complet (`creer`, `mettreAJour`, `changerStatut`, `supprimer`) + `lirePossibles` (responsables actifs)
- `creerChantierDepuisDevis(devisId)` : transaction qui crée le chantier pré-rempli depuis un devis `accepte` et met à jour `devis.chantier_id`
- Transitions de statuts contrôlées + auto-remplissage des dates réelles
- Suppression possible uniquement en `prospect`

**UI**
- Lien « Chantiers » dans le header global
- `/chantiers` (liste + statut pill + filtre rapide visuel) + détail + nouveau + loading
- `<ChantierForm>` avec planning (4 dates), adresse séparée du client
- `<ChangerStatutChantier>` selon transitions valides
- Sur la page devis : bouton « Créer le chantier depuis ce devis » si statut=`accepte` et pas encore lié

**Reporté en M4.2**
- Tâches du chantier (planning basique + avancement %)
- Vue calendrier / Gantt léger

**Reporté en M4.3**
- Documents chantier (plans, PV, PPSPS, photos) via MinIO (`lib/storage/s3.ts`)
- Versioning des plans

**Reporté en M5**
- Migration `responsable_id` → `employe_responsable_id` (table `employes`)
- Membres chantier (ouvriers affectés)

---

### M4 — Itération 3 : Chantiers (suite — M4.2 / M4.3)

**Estimation restante** : 1-2 semaines / 3-4 semaines solo.

**Périmètre MCD** : `TACHE`, `DOCUMENT` (documentaire chantier).

**Livrable**
- Planning tâches (basique, pas de Gantt pour M4 — à envisager M10)
- Upload **documents chantier** (plans, PV, PPSPS, photos) via MinIO
- Rôles chantier : membres (ouvriers + chef_chantier rattachés)

---

### M5 — Itération 4 : RH & pointage ⚠️ **gros morceau**

**Estimation** : 4-5 semaines / **2-3 mois** solo.

**Périmètre MCD** : `EMPLOYE` (complément), `POINTAGE`.

**Livrable**
- **PWA configurée** (manifest, service worker via Workbox, icônes)
- **IndexedDB + outbox pattern** (ADR-004)
- Écran pointage **mobile-first** (grand boutons tactiles, sélection chantier/tâche simplifiée)
- Synchronisation background (Background Sync API + fallback polling)
- Reporting heures par employé / chantier / tâche
- Export Excel des pointages pour paie

---

### M6 — Itération 5 : Facturation

**Estimation** : 3 semaines / **1-2 mois** solo.

**Périmètre MCD** : `SITUATION_TRAVAUX`, `FACTURE`.

**Livrable**
- Situations de travaux **séquentielles par chantier** (avec cumulé et delta calculés)
- Génération facture depuis situation (1-1)
- Cas facture directe (hors situation) pour marchés forfaitaires
- Champs Factur-X complets
- Statuts factures (émise → payée → en retard)
- Retenue de garantie sur marché
- Calcul auto-liquidation TVA BTP
- **Trigger écritures comptables** (pivot interne — ADR-005)

---

### M7 — Itération 6 : Achats

**Estimation** : 2-3 semaines / **1-2 mois** solo.

**Périmètre MCD** : `COMMANDE`, `LIGNE_COMMANDE`, `FOURNISSEUR` (complet).

**Livrable**
- Bons de commande fournisseurs
- Réception des livraisons (M7b si nécessaire)
- Rapprochement factures fournisseurs (import OCR en M7c — reporté à M10 si complexité)

---

### M8 — Itération 7 : Sous-traitance

**Estimation** : 3-4 semaines / **2 mois** solo.

**Périmètre MCD** : `SOUS_TRAITANT` (avec cascade), `CONTRAT_ST`, `FACTURE_ST`.

**Livrable**
- Gestion sous-traitants (distincts des fournisseurs)
- **Cascade** sous-traitance (profondeur max 3, trigger anti-cycle)
- Contrats ST liés aux chantiers
- Factures ST avec retenue de garantie automatique
- Paiement direct sous-traitant (case à cocher facture)
- Qualification RGE

---

### M9 — Itération 8 : Documents administratifs ⚠️ **critique légal**

**Estimation** : 3-4 semaines / **2 mois** solo.

**Périmètre MCD** : `TYPE_DOCUMENT_ADMIN`, `DOCUMENT_ADMIN`, `HISTORIQUE_DOCUMENT`, `ALERTE_DOCUMENT`.

**Livrable**
- Seed types : KBIS, URSSAF, décennale, RC pro, attestation vigilance, Qualibat, RGE
- Cycle de vie document (`en_attente` → `valide` → `expiré`/`rejeté`)
- Upload document + vérification humaine
- **Job cron alertes** J-30/J-15/J-7/J0 (Supabase Cron ou GitHub Actions Scheduler)
- **Blocage** contrat ST si document obligatoire expiré ou manquant
- **Export comptable** Cegid Quadra + Sage 100 + FEC DGFiP (ADR-005)

---

### M10 — Itération 9 : Reporting & tableaux de bord

**Estimation** : 3 semaines / **1-2 mois** solo.

**Livrable**
- KPI consolidés (CA, marge, encours)
- **Marge chantier** en temps réel (CA facturé − coût MO − coût achats − coût ST)
- Encours client, pyramide des âges
- Dashboard par utilisateur (vues différenciées par rôle)
- Export FEC DGFiP (si pas fait en M9)

---

## Hors périmètre (volontairement reporté)

- Module paie complet (interface vers outil existant via export)
- Signature électronique (DocuSign, Yousign)
- App mobile native
- Multi-tenant
- Internationalisation (i18n)
- GED documentaire avancée (versioning de plans BIM)
- EDI complet Chorus Pro (on part Factur-X simple PDF avec XML)
- Intégration calendrier (Outlook, Google)

---

## Cadence réaliste

Estimation pour **1 personne non-développeuse avec apprentissage en parallèle** (TypeScript + SQL + Git + Next.js + Supabase) :

| Phase | Durée estimée | Cumul |
|---|---|---|
| M0 → M1 | 2-3 mois | 3 mois |
| M2 → M5 | 6-9 mois | 12 mois |
| M6 → M8 | 6-9 mois | 21 mois |
| M9 → M10 | 3-4 mois | **24 mois** |

**Conclusion** : compter **18 à 24 mois** avant couverture fonctionnelle complète.

À noter : en mode "tuteur + générateur" avec un assistant IA, cette durée peut se réduire de ~30 % sur les parties techniques, mais la courbe d'apprentissage reste réelle.
