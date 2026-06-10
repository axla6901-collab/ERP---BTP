# Runbooks opérationnels

Procédures pas-à-pas pour les opérations récurrentes ou d'urgence.

## Règle d'or

Un runbook est fait pour être exécuté à 3h du matin par un humain fatigué.
Écrire chaque étape comme une commande **copiable-collable** avec la sortie attendue.

## Runbooks à écrire au fil des itérations

| Runbook | Quand le créer | Priorité |
|---|---|---|
| `infra-locale.md` | **Écrit** (M0) — stack Docker locale (Postgres + MinIO + Mailpit) | haute |
| `user-management.md` | **Écrit** (M1.1, MAJ M1.3) — escalade de rôle, désactivation, suppression RGPD | haute |
| `database-accounts.md` | **Écrit** (M1.2) — rôles `app_rw`, `app_migrator`, rotation MDP | haute |
| `observabilite.md` | **Écrit** (M1.2) — GlitchTip self-hosted | moyenne |
| `rotation-secrets.md` | **Écrit** (M1.2) — Better Auth, DB, S3, GlitchTip | moyenne |
| `ci-deploy.md` | **Écrit** (M1.3) — brancher GitHub Actions, secrets, déploiement futur | moyenne |
| `backup-restore.md` | M2 — test de restauration DB + bucket MinIO | haute |
| `audit-fiscal.md` | M6 — registre numéros factures | moyenne |
| `pwa-deployment.md` | M5 — mise à jour PWA (cache busting) | moyenne |
| `export-comptable.md` | M9 — procédure mensuelle export Cegid/Sage | moyenne |
| `incident-response.md` | M2 — arbre de décision incident | haute |
| `dpo-rgpd.md` | M10 — export/suppression données personnelles | haute |

## Template

Chaque runbook suit la structure :

```markdown
# Runbook — <titre>

## Quand utiliser
<Situation déclenchante>

## Préalables
- Accès à X
- Permission Y

## Procédure

### 1. <Étape>
```bash
<commande>
```
Sortie attendue : ...

### 2. <Étape>
...

## Vérification

Comment confirmer que l'opération a réussi.

## Rollback

Si quelque chose a mal tourné.

## Contacts

Qui appeler si bloqué.
```
