# ADR-009 — Nomenclatures (BOM) versionnées + prix historisés multi-fournisseurs

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta
- **Référence** : prolonge l'[ADR-008](008-catalogue-articles-composes.md)

## Contexte

Un ouvrage BTP type (ex. « 1 m² de mur d'agglo ») est composé de :

- 8 moellons (matériau)
- 20 kg de sable (matériau)
- 1 sac de ciment (matériau)
- 1 h de main d'œuvre (prestation)

Pour calculer son **prix de revient**, il faut :

1. Stocker cette composition (BOM)
2. Pouvoir la modifier sans casser les devis passés (versioning)
3. Stocker les **prix d'achat** des composants, avec historique et **multi-fournisseurs** (référence générique + N fournisseurs négociés)
4. Calculer la somme récursive (un composé peut contenir un sous-composé)

Le modèle M2.1-bis avait posé `articles` avec `type='compose'` mais sans table BOM ni prix. M2.2/M2.3 livre l'ensemble.

## Décision

### Tables

- **`nomenclatures`** : versions immutables d'une BOM par article composé. `valid_from` / `valid_to`. Une seule version courante par article (index unique partiel `WHERE valid_to IS NULL`).
- **`nomenclature_lignes`** : composants d'une version, avec quantité, unité d'emploi, **coefficient de perte** (NUMERIC(5,4) ∈ [0,1), 0 par défaut, ex 0.0500 = 5 %).
- **`prix_articles`** : historique des prix d'achat. **Plusieurs prix actifs simultanément** par article (1 prix de référence avec `fournisseur_id IS NULL` + N prix par fournisseur). Validité temporelle (`valid_from` / `valid_to`).
- **`articles.fournisseur_prefere_id`** : FK optionnelle pour désigner un fournisseur préféré, dont le prix prime dans le calcul.

### Fonctions PostgreSQL

| Fonction                                          | Rôle                                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prix_courant_article(article, date[, chantier])` | Sélectionne le prix retenu selon règle : **prix de référence prioritaire** dès qu'il est renseigné, sinon grilles/prix fournisseurs (cf. ci-dessous) |
| `bom_explode(article, date)`                      | CTE récursive : retourne la BOM aplatie multi-niveaux (profondeur 8 max)                                                                             |
| `bom_cost_roll(article, date)`                    | Somme récursive : prix par feuille × quantité avec perte. Renvoie `total` + `missing_count` + liste articles sans prix                               |
| `bom_where_used(article)`                         | Recherche inverse : ouvrages utilisant cet article                                                                                                   |
| `check_bom_cycle()`                               | Trigger anti-cycle sur `nomenclature_lignes`                                                                                                         |

### Règle de sélection du prix

Pour calculer le prix de revient à une date `D`, dans cet ordre (la 1re règle qui matche gagne) :

1. (si chantier fourni) **Grille rattachée au chantier** → `grille_chantier` _(migration 0017)_
2. **Prix de référence** (`fournisseur_id IS NULL`) → `reference` — **prix retenu dès qu'il est renseigné** _(réordonné par 0067)_
3. **Grille du fournisseur préféré** (sans chantier) → `grille_prefere` _(0016)_
4. **Prix du fournisseur préféré** (`prix_articles`) → `prefere`
5. **Grille la moins chère**, tous fournisseurs actifs → `grille_mini` _(0016)_
6. **Prix le moins cher** parmi les fournisseurs actifs → `mini_fournisseur`
7. Sinon → composant signalé manquant (l'UI affiche un avertissement avec liste)

> **Note (évolution de la règle, 2026-06-10).** Initialement (0007/0016/0017), le prix de référence
> était évalué _avant_ les prix fournisseurs non-préférés. La migration **0061** l'avait basculé en
> **dernier recours** (« repli ultime »), au motif qu'un prix fournisseur réel devait primer.
> Décision finalement revue le même jour (**migration 0067**) : le prix de référence est le prix
> catalogue interne faisant foi — il (re)devient le **prix retenu dès qu'il est renseigné**, prioritaire
> sur tous les prix fournisseurs. Seule la grille rattachée à un chantier (prix négocié explicite et
> contextuel) reste au-dessus de lui. Les prix fournisseurs ne servent que de repli quand aucune
> référence n'existe.

Cette logique est centralisée dans `prix_courant_article` (PL/pgSQL), réutilisée par `bom_cost_roll` et par les Server Actions (`prixCourant`).

### Versioning

Chaque modification de la BOM d'un article composé :

1. Ferme la version courante (`valid_to = now()`)
2. Crée une nouvelle version avec `version = max + 1`, `valid_from = now()`, `valid_to = NULL`
3. Les anciennes versions restent consultables (historique complet)

Avantage : les devis (M3+) référenceront un `nomenclature_id` spécifique pour figer la version utilisée, immuable.

### Multi-fournisseurs (exemple)

```
Article SABLE-FIN :
├─ NULL (référence générique)    → 0,15 €/kg, depuis 2026-01-01
├─ Point P (fournisseur)         → 0,14 €/kg, depuis 2026-04-01, ref = SABLE-FIN-25KG
└─ Lafarge (fournisseur)         → 0,16 €/kg, depuis 2026-05-01, ref = LF-S-001
```

Saisie de prix : un nouveau prix Point P **ferme uniquement l'ancien prix Point P** (pas le prix de référence ni le prix Lafarge).

## Conséquences

### Positives

- **Composition réutilisable** : un ouvrage défini une fois sert tous les devis
- **Versioning sûr** : modifier la BOM n'altère pas les devis passés
- **Multi-fournisseurs réaliste** : prix de référence métier + prix négociés par fournisseur
- **Calcul automatique** : `bom_cost_roll` retourne le prix de revient sans logique applicative à dupliquer
- **Détection cycle DB** : trigger Postgres garantit qu'on ne peut pas créer A→B→A
- **Audit trail** : chaque mutation passe par `audit_log` (M1.2)

### Négatives / Risques

- **N+1 sur listing articles** : la liste appelle `prix_courant_article` + `bom_cost_roll` via sous-requêtes pour chaque ligne. OK jusqu'à ~200 articles, à optimiser ensuite (vue matérialisée `articles_avec_prix` rafraîchie sur changement) — M2.4
- **Profondeur max 8** dans le trigger anti-cycle et `bom_explode` : limite arbitraire. Pertinent pour BTP (rarement > 4) ; à relâcher si chaudronnerie complexe
- **Pas de conversion d'unité au calcul** : si l'unité d'emploi en BOM ≠ unité de prix, la formule actuelle est silencieusement incorrecte. À durcir en M2.4 (validation explicite que `unite_emploi_id = prix.unite_id`, ou table de conversion intermédiaire utilisant les caractéristiques physiques de l'article)
- **Prix générique sans expiration explicite** : si on oublie de fermer un vieux prix, il reste actif. L'UI signale les prix > 30 j comme « à vérifier » (M2.4)

### Mitigations

- Tests Vitest sur les schémas Zod (validation côté serveur)
- Smoke tests des fonctions PG (`bom_explode`, `bom_cost_roll`) à ajouter en M2.3 quand on aura des données réelles
- ADR-010 prévu pour formaliser la conversion d'unités si nécessaire

## Alternatives considérées

1. **Pas de versioning** (écrasement) — rejeté : devis passés altérés rétroactivement, problème de traçabilité fiscale
2. **Stocker le prix sur `articles` directement** — rejeté : pas d'historique, pas de multi-fournisseurs
3. **Calcul côté application TS** — rejeté : performance moins bonne, code dupliqué entre Server Actions, perte d'atomicité avec la lecture des prix
4. **Temporal Tables (SQL Server)** — non applicable (on est en Postgres ; on utilise `valid_from`/`valid_to` + `audit_log` à la place)

## Révision

À revisiter si :

- Performance dégradée sur liste articles → matérialiser le prix calculé
- Besoin de conversion d'unités automatique (M² → KG via densité × épaisseur)
- Besoin de prix par tranche / dégressivité plus complexe (palier multiple)
- Multi-établissement : prix négocié différemment par établissement
