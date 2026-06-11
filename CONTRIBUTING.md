# Contribuer

> Projet solo actuellement, mais les bonnes pratiques s'appliquent dès le départ. Elles construisent des habitudes durables et rendent le code maintenable si d'autres rejoignent le projet plus tard.

## Workflow Git

1. **Branche par feature** : `git checkout -b feat/<nom-court>`
2. **Commits petits et atomiques**, messages en français
3. **Pousser** : `git push -u origin feat/<nom>`
4. **Créer une PR** vers `main` (même en solo, pour la discipline et l'historique)
5. **Vérifier la CI verte** avant de merger
6. **Squash-and-merge** pour garder `main` propre

**Jamais** de `git push --force` sur `main`. **Jamais** de `git commit --no-verify` sauf cas d'urgence documenté.

## Format des commits (Conventional Commits)

```
<type>(<scope>): <description courte>

[corps optionnel expliquant le pourquoi]

[footer optionnel, ex. BREAKING CHANGE, refs issue]
```

**Types** :

- `feat` : nouvelle fonctionnalité
- `fix` : correction de bug
- `docs` : documentation uniquement
- `refactor` : refactoring sans changement fonctionnel
- `test` : ajout/modification de tests
- `chore` : maintenance, dépendances
- `perf` : amélioration de performance
- `ci` : changement CI
- `security` : correction de sécurité

**Exemples** :

- `feat(catalogue): ajoute la composition d'ouvrage`
- `fix(devis): corrige le calcul HT pour les lignes article`
- `docs(adr): ajoute l'ADR-006 sur les backups`
- `chore(deps): met à jour Next.js en 15.0.1`

## Décisions structurantes → ADR

**Avant** toute décision architecturale ou technique non-triviale, écrire un ADR :

1. Copier `docs/adr/000-template.md` vers `docs/adr/NNN-<titre-court>.md`
2. Remplir les sections : Contexte, Décision, Conséquences, Alternatives
3. Le commettre dans la PR de la décision

Exemples de décisions qui méritent un ADR :

- Changer de librairie majeure (ORM, framework UI)
- Ajouter un service externe (envoi d'email, paiement)
- Modifier la stratégie de sécurité (auth, RBAC)
- Introduire une nouvelle convention de code

## Avant de pusher

- [ ] `pnpm check` passe (lint + typecheck)
- [ ] `pnpm test` passe (Vitest)
- [ ] Les ajouts de code métier sont couverts par des tests unitaires
- [ ] Une nouvelle migration DB a été **relue** (le SQL généré, pas seulement le schema TypeScript)
- [ ] L'ADR a été créé si la décision est structurante

## Structure des commits

Un commit doit laisser le repo dans un état **buildable et testable**. Si tu dois casser temporairement, utilise une branche et ne push pas sur `main`.

## Revue de code

Même en solo, prendre 5 minutes pour **relire sa propre PR** avant le merge. Regarder le diff avec des yeux neufs révèle souvent des oublis.

## Secrets

- **Jamais** de secret en dur dans le code
- **Jamais** de `.env.local` commité
- Variables sensibles uniquement dans `.env.local` (local) ou dans le secret manager de la plateforme (prod)
