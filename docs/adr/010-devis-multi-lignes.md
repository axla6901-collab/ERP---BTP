# ADR-010 — Devis multi-lignes + multi-TVA

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta

## Contexte

M3.1 : premier module à valeur métier visible. Un utilisateur doit pouvoir saisir un devis pour un client en réutilisant le catalogue M2.2 et obtenir des totaux corrects (HT, TVA par taux, TTC).

Spécificités BTP qui ont guidé le modèle :
- Mélange d'**ouvrages composés** (du catalogue) et **lignes libres** (cas particuliers non catalogués)
- **Sections / titres** pour structurer un devis long (« Gros œuvre », « Second œuvre »)
- **Multi-TVA** : 20 % standard, 10 % rénovation, 5,5 % énergétique, voire auto-liquidation (0 %)
- **Remises** par ligne (rabais commercial)
- **Validité du devis** (souvent 30 jours)

## Décision

### Modèle data
- **`clients`** : union discriminée particulier / professionnel (CHECK SQL). SIRET et TVA intracom optionnels (validés au format).
- **`devis`** : en-tête avec totaux **cachés** (`total_ht`, `total_tva`, `total_ttc`) + détails TVA en JSONB (`{"20.00": {base, tva}, ...}`)
- **`lignes_devis`** : type discriminé `section` / `article_catalogue` / `libre` avec CHECK SQL :
  - section → tout est NULL sauf désignation
  - article_catalogue → `article_id` obligatoire + tous les champs montants
  - libre → `article_id` NULL + tous les champs montants

### Calcul des totaux
- Fonction pure **`calculerTotauxDevis(lignes)`** dans `lib/commercial/calculs.ts`
- Réutilisée côté **server** (Server Actions, persistance des cachés à chaque save) et côté **client** (composant `<TotauxDevis>` qui recalcule live à chaque saisie)
- Sections ignorées dans les totaux
- Formule par ligne : `ht = qty × pu × (1 - remise%)` puis `tva = ht × taux/100`

### Workflow états
- `brouillon` → `envoye` → `accepte` | `refuse` | `expire`
- `refuse` / `expire` peuvent repasser en `envoye` (re-relance)
- `accepte` est terminal (en M3.1 ; un workflow plus riche en M3.2 permettra le retour brouillon ou la création de chantier)
- Suppression possible **uniquement en `brouillon`** (cohérence fiscale : un devis envoyé doit rester traçable)

### Numérotation
- Réutilise `generate_numero('devis')` (M1.2, ADR-003) → format `D-2026-000042`
- Append-only via `numeros_attribues`, justifiable en cas de saut

### Versioning
- **Pas de versioning** des devis en M3.1 (contrairement aux BOM M2.2). On édite directement le devis tant qu'il est en `brouillon`. Pour les modifications après envoi, M3.2 introduira **« cloner »** (créer un nouveau devis à partir d'un existant).
- Justification : un devis envoyé est immutable de fait (engagement vers le client). Pas besoin de versions multiples actives.

### Lien chantier
- Champ `chantier_id` placeholder (nullable, pas de FK encore). Sera activé en M4.

## Conséquences

### Positives
- **Réutilisation du catalogue** : un article catalogue ajouté à un devis auto-remplit prix de revient (calculé via BOM si composé), unité, désignation
- **Cohérence fiscale** : numérotation continue, audit log sur chaque mutation, suppression bloquée hors brouillon
- **Multi-TVA réaliste** : un devis peut mélanger 20 % (matériel) et 10 % (MO rénovation) avec détail par taux
- **UI fluide** : totaux recalculés live côté client (pas d'aller-retour serveur), persistance côté serveur à la sauvegarde

### Négatives / Risques
- **Cache des totaux** : si modification SQL directe (hors Server Action), les totaux du devis sont désynchronisés. Mitigation : tout passe par les SA en M3.1
- **Suppression de lignes** : à chaque save on fait DELETE puis INSERT de toutes les lignes. Atomique (transaction) mais ré-attribue les UUID. Acceptable car aucune entité externe ne référence une ligne (pour l'instant)
- **Pas d'auto-liquidation BTP automatique** : l'utilisateur doit choisir manuellement le taux 0 % et ajouter la mention dans les conditions. Sera automatisé en M3.2 avec un flag « auto-liquidation » sur le client professionnel + bandeau d'info
- **Devis figé après envoi** : impossible de modifier sans cloner. Pourrait surprendre l'utilisateur. À documenter en aide en ligne (M3.2)

## Alternatives considérées

1. **Sections via une table séparée `devis_sections`** — rejeté : complexifie la modélisation sans bénéfice ; les sections sont des lignes spéciales avec leur propre `ordre`
2. **Totaux calculés à la volée (pas de cache)** — rejeté : impact perf sur la liste devis (jointure + calcul × N lignes par devis)
3. **TVA stockée au niveau du devis (un seul taux)** — rejeté : ne couvre pas le cas réel BTP (mélange neuf + rénovation = mélange 20 % + 10 %)
4. **Lignes plates sans type** (article_id NULL = libre) — rejeté : sections impossibles à modéliser sans champ explicite

## Révision

À revisiter si :
- Devis très longs (> 100 lignes) : prévoir pagination côté UI
- Besoin de comparer plusieurs versions d'un même devis : versioning à la BOM (table `devis_versions` + `lignes_devis_versions`)
- Multi-établissement : ajouter `etablissement_id` sur devis (chaque établissement a sa propre séquence)
