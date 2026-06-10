# ERP BTP

ERP Bâtiment modulaire pour PME BTP française (10-50 utilisateurs, mono-tenant).

## État du projet

**Jalon M0 — Fondations documentaires** ✅ **TERMINÉ**
- ADR 001 à 005 rédigés (stack, séparation utilisateur/employé, numérotation, offline pointage, export comptable)
- Arborescence du projet créée
- Configuration outillage (TypeScript strict, Next.js 15, Tailwind, Drizzle, Vitest, Playwright)
- Documentation (ROADMAP, architecture, MCD mapping)

**Jalon M1 — Itération 0 : Auth & Audit** 🔜 à venir
- Tables `utilisateurs`, `employes`, `audit_log`, `sessions`
- Auth Supabase (MFA TOTP, magic link, OAuth)
- RBAC + RLS Postgres
- Premier écran protégé

**Jalon M2 et suivants** — voir [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Pré-requis — à installer AVANT de démarrer

> **Tu n'es pas développeur — pas de panique**, voici l'ordre exact.

### 1. Outils de base (~30 min)

| Outil | Pourquoi | Installation |
|---|---|---|
| **Node.js 22.x LTS** (« Jod ») | Exécuter l'application | [nodejs.org](https://nodejs.org/) → bouton **LTS** |
| **pnpm** | Gestionnaire de paquets | Après Node : `npm install -g pnpm@9` dans un terminal |
| **Git** | Versionner le code | [git-scm.com](https://git-scm.com/) (choisir "Git Bash" comme terminal) |
| **VS Code** | Éditeur de code | [code.visualstudio.com](https://code.visualstudio.com/) |

Après installation, ouvre **Git Bash** (clic droit sur le bureau → "Open Git Bash here") et vérifie :
```bash
node --version    # doit afficher v22.x.x (cf. .nvmrc)
pnpm --version    # doit afficher 9.x.x
git --version
```

### 2. Extensions VS Code recommandées

Ouvre VS Code, installe depuis le marketplace :
- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)
- **Tailwind CSS IntelliSense** (`bradlc.vscode-tailwindcss`)
- **GitLens** (`eamodio.gitlens`)
- **Error Lens** (`usernamehw.errorlens`)

### 3. Comptes à créer

| Service | Usage | Plan de départ |
|---|---|---|
| **GitHub** — [github.com](https://github.com) | Hébergement code | Gratuit |
| **Supabase** — [supabase.com](https://supabase.com) | DB + Auth + Storage | Gratuit (500 Mo DB + 1 Go storage) |
| **Sentry** — [sentry.io](https://sentry.io) (plus tard, M1) | Monitoring erreurs | Gratuit (5k événements/mois) |

**Supabase** : à la création du projet, choisir **région `EU-West`** (Paris si disponible, sinon Frankfurt).

---

## Démarrage local

Une fois les pré-requis installés :

```bash
# 1. Ouvrir un terminal dans le dossier erp-btp
cd /c/Users/aacosta/Downloads/Claude/erp-btp

# 2. Installer les dépendances (~3-5 min la première fois)
pnpm install

# 3. Copier et remplir les variables d'environnement
cp .env.example .env.local
# Éditer .env.local dans VS Code et remplir les clés Supabase
#   (Supabase Dashboard > Settings > API)

# 4. Lancer le serveur de développement
pnpm dev
```

Ouvre http://localhost:3000 → tu dois voir la page d'accueil du squelette.

---

## Arborescence

```
erp-btp/
├── app/                    # Pages & routes Next.js (App Router)
├── components/             # Composants React réutilisables
│   └── ui/                 # Composants shadcn/ui
├── lib/                    # Logique métier et utilitaires
│   ├── db/                 # Client Drizzle
│   ├── auth/               # Helpers Supabase Auth
│   ├── audit/              # Audit log
│   ├── numbering/          # Numérotation métier (ADR-003)
│   └── validation/         # Schémas Zod
├── db/
│   ├── schema/             # Schémas Drizzle par domaine
│   ├── migrations/         # Migrations SQL générées
│   └── seeds/              # Données d'amorçage
├── docs/
│   ├── adr/                # Architecture Decision Records
│   ├── runbooks/           # Procédures opérationnelles
│   ├── ROADMAP.md
│   ├── architecture.md
│   └── MCD.md              # Mapping entités MCD → tables DB
├── tests/
│   ├── unit/               # Tests Vitest
│   └── e2e/                # Tests Playwright
├── public/                 # Assets statiques
└── .github/workflows/      # CI GitHub Actions
```

---

## Documentation clé

| Document | Contenu |
|---|---|
| [docs/ROADMAP.md](docs/ROADMAP.md) | Itérations 0 à 9 avec estimations |
| [docs/architecture.md](docs/architecture.md) | Vue C4, flux de données, modules |
| [docs/MCD.md](docs/MCD.md) | Correspondance MCD ↔ tables DB |
| [docs/adr/001-stack.md](docs/adr/001-stack.md) | Pourquoi cette stack |
| [docs/adr/002-user-vs-employe.md](docs/adr/002-user-vs-employe.md) | Séparation utilisateur/employé |
| [docs/adr/003-numerotation.md](docs/adr/003-numerotation.md) | Numérotation devis/factures |
| [docs/adr/004-offline-pointage.md](docs/adr/004-offline-pointage.md) | Offline-first pointage chantier |
| [docs/adr/005-export-compta-fr.md](docs/adr/005-export-compta-fr.md) | Export Cegid/Sage/FEC |

---

## Scripts utiles

| Commande | Effet |
|---|---|
| `pnpm dev` | Serveur de développement |
| `pnpm build` | Build production |
| `pnpm lint` | Vérifier ESLint |
| `pnpm typecheck` | Vérifier TypeScript |
| `pnpm check` | Lint + typecheck |
| `pnpm test` | Tests unitaires (Vitest) |
| `pnpm test:e2e` | Tests end-to-end (Playwright) |
| `pnpm db:generate` | Générer une migration depuis le schéma |
| `pnpm db:migrate` | Appliquer les migrations |
| `pnpm db:studio` | Drizzle Studio (UI pour la DB) |
| `pnpm db:seed` | Peupler la DB avec les seeds |
| `pnpm format` | Formater le code (Prettier) |

---

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Sécurité

Voir [SECURITY.md](SECURITY.md).

## Licence

Propriétaire. Tous droits réservés — compte-r.com.
