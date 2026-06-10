# ADR-012 — Tâches du chantier (M4.2)

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta

## Contexte

M4.1 a livré le chantier comme entité racine (libellé, client, statut). Mais sans liste de travaux à accomplir, le chantier reste un placeholder vide. M4.2 ajoute des **tâches** : ce qui doit être fait, par qui, à quelle date, avec quel avancement.

## Décision

### Modèle data

**Table `chantier_taches`** :
- `chantier_id` FK ON DELETE CASCADE (si on supprime un chantier hard, les tâches partent)
- `ordre` INT : position dans la liste (non unique — l'unicité serait gênante au déplacement)
- `libelle` TEXT NOT NULL
- `responsable_id` TEXT NULL FK `utilisateurs` (cohérent avec M4.1, à étendre M5)
- `statut` enum `statut_tache` (a_faire, en_cours, bloque, termine, annule)
- `avancement_pourcent` INT CHECK 0-100
- 4 dates (prévues + réelles), description, notes
- audit + soft delete

**Pas de numérotation explicite** (`T-2026-...`) : les tâches sont internes au chantier, l'ID UUID + `ordre` suffit.

**Liste à plat ordonnée** : pas de hiérarchie parent/enfant. Suffit pour 95 % des chantiers BTP en petite structure. Si on en ressent vraiment le besoin plus tard, on ajoutera des sections (comme dans les devis M3.1) — pas un arbre complet.

### Statut + avancement

On garde **les deux** :
- L'enum pour les transitions discrètes (« bloqué » a un sens fort qu'un % ne capte pas)
- Le % pour la finesse (on peut être à 60 % d'une tâche `en_cours`)

**Cohérence forcée** :
- Passage à `termine` → `avancement_pourcent = 100` (auto)
- Passage à `en_cours` → `date_debut_reelle = today` si vide (auto)

**Transitions** :
```
a_faire   → en_cours | annule
en_cours  → bloque | termine | annule
bloque    → en_cours | annule
termine   → en_cours (réouverture si défaut)
annule    → terminal
```

### Réordonnancement

Boutons ↑/↓ par ligne, échange l'`ordre` avec la tâche voisine via deux UPDATE dans une transaction. Pas de drag&drop en M4.2 (surface trop large : lib externe, focus management, accessibilité).

### UI intégrée

Pas de page dédiée pour les tâches : section directement dans `chantiers/[id]/page.tsx`. Justification : les tâches n'ont pas de vie propre, elles n'ont de sens qu'attachées à leur chantier. Une page séparée multiplierait les clics sans bénéfice.

L'édition se fait par expansion de ligne (mode édition inline) plutôt que par modal — pas de composant Dialog shadcn installé, et le pattern inline reste cohérent avec le reste de l'app (cf. `<NomenclatureEditor>` M2.2).

## Conséquences

### Positives
- **Suivi opérationnel concret** : on peut enfin dire « 4 tâches sur 10 terminées » sur un chantier
- **Indicateur d'avancement chantier** : moyenne pondérée des tâches (calculée côté UI pour M4.2, à matérialiser en M4.4+ si besoin)
- **Audit complet** : chaque changement de statut + chaque mise à jour tracée
- **Transitions guardées** : pas de saut illogique (a_faire → termine est interdit, doit passer par en_cours)

### Négatives / Risques
- **Pas de dépendances entre tâches** : on ne peut pas exprimer « T2 commence après T1 ». Acceptable pour M4.2 (le BTP en petite structure ne fait pas de Gantt formel). M10 reconsidérera.
- **Pas de drag&drop** : l'ergonomie est moindre pour réordonner > 10 tâches. Boutons ↑/↓ restent fonctionnels.
- **Ordre non unique** : deux tâches peuvent avoir le même `ordre` après un cas de concurrence. L'ordre secondaire est `created_at` (déterministe). Pas de bug fonctionnel.
- **Cascade chantier → tâche** : un futur hard delete d'un chantier emporte ses tâches. Mais `supprimerChantier` fait un soft delete uniquement (cohérence : on ne perd pas les tâches). Si on ajoute un hard delete plus tard, à reconsidérer.

## Alternatives considérées

1. **Tâches hiérarchiques parent/enfant** — rejeté : ajoute trigger anti-cycle, calcul d'avancement remonté, UI arborescente. Disproportionné pour la cible (PME BTP). Sections plates suffisent si besoin de regrouper.
2. **Pourcentage seul (pas d'enum)** — rejeté : perd l'état « bloqué » qui est un cas réel BTP (attente fournisseur, intempéries) impossible à exprimer en %.
3. **Page dédiée `/chantiers/[id]/taches`** — rejeté : multiplie les clics, sépare artificiellement la tâche de son contexte (le chantier).
4. **Drag & drop** — reporté : trop de surface UI pour la valeur ajoutée à ce stade.
5. **Numérotation `T-...`** — rejeté : interne, UUID+ordre suffit. Cohérent avec `lignes_devis` (pas numérotées non plus).

## Révision

À revisiter quand :
- Plus de 50 tâches/chantier devient régulier → pagination ou regroupement par phase
- Besoin de dépendances temporelles → Gantt léger (M10)
- M5 introduit `employes` → migration `responsable_id` → `employe_responsable_id`
- Reporting consolidé → vue matérialisée `chantier_avancement` (avg des tâches non annulées)
