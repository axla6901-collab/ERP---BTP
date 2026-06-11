# ADR-011 — Module Chantiers (socle M4.1)

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta

## Contexte

M3.1 a livré le module commercial avec devis multi-lignes. Un champ placeholder `devis.chantier_id` UUID NULL (sans FK) attendait l'arrivée du module chantiers. M4.1 transforme cette intention en réalité.

Spécificités BTP qui ont guidé le modèle :

- Un chantier est rattaché à **un client** mais peut avoir **plusieurs devis** (devis initial + avenants)
- Un chantier a une **adresse de chantier** distincte de l'adresse de facturation du client
- Le **planning** distingue prévisionnel et réel (souvent décalé)
- Le **responsable** est un utilisateur de l'app (jusqu'à M5 où la table `employes` arrivera)

## Décision

### Modèle data

**Table `chantiers`** — champs principaux :

- `numero` : `CH-2026-NNNNNN` via `generate_numero('chantier')` (extension de la fonction PG)
- `libelle` : titre court
- `client_id` : FK obligatoire vers `clients`
- `responsable_id` : FK NULL vers `utilisateurs` (cf. plus bas)
- `statut` : enum `statut_chantier` ∈ {prospect, en_cours, suspendu, termine, annule}
- 4 dates : `date_debut_prevue`, `date_fin_prevue`, `date_debut_reelle`, `date_fin_reelle`
- `montant_previsionnel_ht` : pré-rempli depuis devis le cas échéant
- adresse chantier (séparée de l'adresse client)
- description + notes
- audit standard + soft delete

**CHECK SQL** :

- Cohérence des dates (fin ≥ début quand les deux sont renseignées)
- Code postal FR si renseigné

**Index unique partiel** : `(numero) WHERE deleted_at IS NULL`

### Workflow états

```
prospect → en_cours | annule
en_cours → suspendu | termine | annule
suspendu → en_cours | annule
termine, annule → terminal
```

**Auto-remplissage des dates réelles** :

- Passage à `en_cours` → `date_debut_reelle = CURRENT_DATE` si pas déjà saisie
- Passage à `termine` → `date_fin_reelle = CURRENT_DATE` si pas déjà saisie

**Suppression** : possible **uniquement en `prospect`** (cohérence : un chantier en cours est une réalité opérationnelle qui ne disparaît pas).

### Responsable : `utilisateurs.id` (TEXT)

Choix pragmatique : on utilise `utilisateurs.id` comme `responsable_id` au lieu d'attendre la table `employes` (M5).

Justification :

- ADR-002 a déjà acté la séparation `user/utilisateurs/employes` mais autorise une **transition souple**
- Un responsable de chantier est forcément un utilisateur du système (il doit pouvoir se connecter pour piloter)
- Si en M5 on introduit `employes`, on ajoutera `chantiers.employe_responsable_id` en parallèle sans casser l'existant

### Lien devis ↔ chantier

**Activation de la FK** :

```sql
ALTER TABLE devis ADD CONSTRAINT fk_devis_chantier
  FOREIGN KEY (chantier_id) REFERENCES chantiers(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL` plutôt que `CASCADE` : si un chantier disparaît (soft delete → puis hard delete éventuel en archivage), le devis reste consultable, juste sans lien. Cohérence fiscale du devis maintenue.

**Cardinalité** :

- 1 devis = au plus 1 chantier (1 chantier référencé par `devis.chantier_id`)
- 1 chantier = N devis possibles (devis initial + avenants)

**Workflow devis → chantier** :

- Bouton **« Créer le chantier depuis ce devis »** visible sur un devis `accepte` non encore lié, pour les rôles `ROLES_CHANTIER_WRITE`
- Server Action `creerChantierDepuisDevis(devisId)` : transactionnelle
  1. Lit le devis, vérifie statut=`accepte` + `chantier_id IS NULL`
  2. Crée le chantier avec `libelle = devis.objet ?? "Chantier <numero>"`, `client_id` du devis, `montant_previsionnel_ht = devis.total_ht`, statut `prospect`, responsable = utilisateur courant
  3. Update `devis.chantier_id` vers le chantier créé
  4. Audit log
- Pas d'automatisation (le passage devis → accepté **ne crée pas** automatiquement un chantier) : l'utilisateur garde le contrôle.

## Conséquences

### Positives

- **Continuité métier** : un devis accepté débouche naturellement sur un chantier sans ressaisie
- **Souplesse avenants** : un chantier peut accumuler plusieurs devis (architecture prête pour la facturation par situations M6)
- **Adresse chantier séparée** : on peut facturer le client à un siège et délivrer ailleurs (chantier réel)
- **Transitions explicites** : pas d'erreur de saisie possible (table TRANSITIONS_CHANTIER + check côté server action)
- **Audit complet** : chaque mutation + changement de statut tracée

### Négatives / Risques

- **Responsable = utilisateur** : non scalable pour les chantiers avec sous-traitants ou ouvriers non-app. Mitigation : M5 introduira `employes` avec FK séparée.
- **Pas de tâches en M4.1** : pas de planning fin (M4.2)
- **Pas de documents en M4.1** : pas d'upload PV/PPSPS (M4.3 via MinIO)
- **Suppression conditionnelle** : un chantier passé en `en_cours` puis annulé reste consultable en `annule`. C'est voulu (traçabilité) mais peut surprendre.

## Alternatives considérées

1. **Chantier auto-créé au passage devis→accepté** — rejeté : trop magique, l'utilisateur veut souvent réviser le périmètre avant de lancer le chantier (réagir au montant, ajuster les dates, etc.)
2. **`responsable_id` FK vers `employes(id)`** — reporté à M5 : oblige à livrer `employes` maintenant, hors périmètre M4.1
3. **Table `devis_chantier` (N-N)** — rejeté : 1 devis = 1 chantier est la règle métier ; la jointure est asymétrique (chantier peut avoir N devis, mais devis appartient à 1 seul chantier). FK simple suffit.
4. **Statuts unifiés devis+chantier** — rejeté : sémantique différente, mélange les concepts

## Révision

À revisiter quand :

- M4.2 introduit `chantier_taches` (planning) → workflow `en_cours` plus riche (% avancement basé sur tâches)
- M4.3 introduit upload documents → champ obligatoire `dossier_minio_id` ?
- M5 livre `employes` → ajouter `employe_responsable_id`, basculer l'UI, déprécier `responsable_id` ?
- M6 livre facturation → champ `chantier.facture` (cache des situations émises)
