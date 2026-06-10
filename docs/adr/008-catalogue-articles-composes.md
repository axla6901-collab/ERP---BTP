# ADR-008 — Modèle catalogue « Articles composés » (adaptation BTP)

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta
- **Supersede** : la version M2.1 du modèle catalogue (refonte sur place)

## Contexte

L'utilisateur a fourni un prompt issu d'un autre projet (Compte-R, chaudronnerie industrielle, SQL Server) décrivant un modèle riche d'articles composés (BOM récursive multi-niveaux, triple unité, versioning, historique prix, stock multi-dépôts). Le modèle M2.1 actuel (familles_ouvrage + familles_article + ouvrages + compositions_ouvrage + articles à plat) est insuffisant pour les besoins industriels que ce prompt couvre.

L'adaptation BTP a été cadrée avec quatre arbitrages :

| Question | Choix |
|---|---|
| Refonte ou enrichissement ? | **Refonte complète** |
| Stock multi-dépôts ? | **Exclu** (BTP = achat par chantier) |
| Triple unité (achat/stock/vente) ? | **Inclus** |
| BOM récursive + versioning ? | **Inclus** |

## Décision

### Modèle de données M2.1-bis (Postgres)

1. **`unites`** : référentiel partagé (KG, M, M2, M3, ML, U, H, J, SAC, PAL, L, T, FORFAIT…) avec type catégoriel (`masse`, `longueur`, `surface`, `volume`, `unitaire`, `temps`, `autre`)
2. **`unite_conversions`** : facteurs entre unités du **même type** (1 T = 1000 KG, 1 J = 8 H). Trigger PG empêche les conversions cross-type ; celles-ci passent par les caractéristiques physiques de l'article.
3. **`familles`** : **table unique hiérarchique** (parent_id récursif, profondeur max 5, trigger anti-cycle). Fusionne les anciennes `familles_ouvrage` et `familles_article`.
4. **`articles`** : **table unique unifiée**, champ `type` enum (`simple`, `compose`, `prestation`, `operation`). Fusionne les anciens `articles` (simples) et `ouvrages` (composés). Triple unité (`unite_achat_id`, `unite_stock_id`, `unite_vente_id`) + caractéristiques physiques optionnelles (`densite`, `epaisseur`, `longueur_std`, `largeur_std`) pour conversions cross-type.
5. **`fournisseurs`** : inchangé (M2.3 reprendra les tarifs).
6. **Tables reportées en M2.2** : `nomenclatures`, `nomenclature_lignes` (BOM versionnée + validités temporelles), fonctions PG `bom_explode`, `bom_cost_roll`, `bom_where_used`, trigger anti-cycle.
7. **Tables reportées en M2.3** : `prix_articles` (historique unitaire avec `valid_from`/`valid_to`, lien optionnel vers fournisseur).

### Différences vs prompt original

| Prompt original (chaudronnerie SQL Server) | erp-btp (BTP Postgres) |
|---|---|
| SQL Server, T-SQL, stored procedures | PostgreSQL, PL/pgSQL, fonctions |
| Temporal Tables `SYSTEM_VERSIONING = ON` | `audit_log` JSONB (M1.2) + colonnes `valid_from`/`valid_to` sur liens BOM |
| Stock multi-dépôts (table Stock + mouvements) | **Exclu** |
| Schémas dédiés `[bom]` ou `[articles]` | `public` (un seul schéma — projet mono-tenant) |
| Codes contraints par famille | Codes saisis libres, regex `[A-Z0-9._-]{2,32}` |
| Collation `French_CI_AS` | UTF-8 par défaut Postgres (suffisant FR) |

### Migration des données existantes (one-shot)

Le script `db/migrations/0006_catalogue_refonte.sql` :
1. Crée enums + nouvelles tables
2. Seed le référentiel `unites` (10+ unités BTP)
3. Migre `familles_ouvrage` → `familles` (préfixe `OUV-`)
4. Migre `familles_article` → `familles` (préfixe `ART-`)
5. Migre `articles` → `articles_v2` avec mapping `unite` texte → `unites.id` (fallback `U`)
6. Renomme les anciennes tables en `*_legacy_2026_05_21` (DROP final laissé à l'admin)

Les comptes BTP existants ont été migrés sans perte (3 familles + 1 article au moment de la bascule).

## Conséquences

### Positives
- **Modèle riche** capable d'évoluer vers BOM + tarifs historisés sans refonte
- **Un seul concept d'article** (au lieu de articles + ouvrages) → moins de duplication code
- **Hiérarchie de familles** indispensable pour navigation BTP réelle (catégories métier)
- **Triple unité** = pré-requis pour gestion d'achat et de tarification BTP réaliste
- **Conversions** : tables (KG↔T, M↔ML, J↔H) + caractéristiques physiques (densité, épaisseur pour Tôle/M²↔KG)

### Négatives / Risques
- **Migration destructive** : les anciennes tables sont renommées en `*_legacy_*`. À supprimer définitivement après validation
- **Codes préfixés** (`OUV-`, `ART-`) sur les familles migrées : à renettoyer si l'utilisateur le souhaite (un coup de SQL update)
- **Complexité accrue** : 5 tables au lieu de 2 (`familles` + `articles` vs anciens). Justifié par la richesse fonctionnelle
- **Pas de BOM en M2.1-bis** : un article `type='compose'` est valide mais sans composition. Présentation UI à compléter en M2.2

### Mitigations
- Triggers Postgres pour invariants (cycles familles, conversions cross-type) → erreurs claires
- Soft delete partout (deleted_at) + UNIQUE index partiels (autorise réutilisation du code après soft delete)
- ADR-009 « BOM récursive » à venir en M2.2 documentera les choix de stockage versionning

## Alternatives considérées

1. **Garder le modèle M2.1 et étendre** — rejeté : la séparation `ouvrages`/`articles` produit du code dupliqué et empêche les BOM récursives (un ouvrage ne peut pas contenir un autre ouvrage).
2. **Tables `produits_finis` / `composants` séparées** — rejeté : moins flexible que `articles` unifié avec un champ `type`.
3. **Stock multi-dépôts dans M2.1-bis** — rejeté : non pertinent pour le métier BTP (achat par chantier).

## Révision

À revisiter si :
- L'utilisateur a besoin de stock physique (apparition d'un atelier ou dépôt central) → réintroduire les tables Stock du prompt original
- La profondeur de familles dépasse 5 niveaux → relâcher le trigger
- Le multi-établissement devient nécessaire → ajouter `etablissement_id` sur les tables métier
