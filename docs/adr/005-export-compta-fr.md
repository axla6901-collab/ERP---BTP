# ADR-005 — Export comptable vers Cegid et Sage

- **Statut** : Accepté — à confirmer en itération M9 (documents admin + export)
- **Date** : 2026-04-21
- **Décideur** : @aacosta

## Contexte

L'ERP doit produire des **exports comptables** consommables par l'expert-comptable de la PME utilisatrice. Les logiciels comptables demandés :

- **Cegid Quadra** (ou Cegid Expert)
- **Sage 100** (ou Sage Batigest, Sage BOB pour certaines fiduciaires)

Format demandé par l'utilisateur : **TXT**.

Périmètre des écritures à exporter :

- **Ventes** : factures clients (`FACTURE`) → compte `411` (clients) / `70x` (ventes) / `4457` (TVA collectée)
- **Achats** : factures fournisseurs (`FACTURE_FOURNISSEUR` à modéliser en M7) → `401` / `60x` / `4456`
- **Sous-traitance** : `FACTURE_ST` → `611` (sous-traitance) + retenue garantie en `4017` (retenues de garantie sur factures à payer)
- **TVA auto-liquidée** (BTP art. 283-2 nonies CGI) : traitement spécifique, pas de `4457`/`4456` mais mention sur la facture et écriture miroir chez le preneur

## Décision

### Approche : pivot interne + adaptateurs par logiciel cible

```
┌──────────────────────────────────────────────┐
│ ecritures_comptables (format pivot interne)  │
│ - id, date_ecriture, journal, compte,        │
│   debit, credit, piece_reference, libelle    │
└───────────────┬──────────────────────────────┘
                │
     ┌──────────┼────────────────┐
     ▼          ▼                ▼
 ┌────────┐ ┌────────┐      ┌──────────┐
 │ Cegid  │ │  Sage  │      │   FEC    │
 │ Quadra │ │  100   │      │  DGFiP   │
 │ .txt   │ │  .txt  │      │  .txt    │
 └────────┘ └────────┘      └──────────┘
```

### Table pivot

```sql
CREATE TABLE ecritures_comptables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_ecriture DATE NOT NULL,
  journal_code TEXT NOT NULL,           -- VTE, ACH, OD...
  compte TEXT NOT NULL,                 -- plan comptable (411000, 70100...)
  compte_auxiliaire TEXT NULL,          -- ex. 411CLIENT001
  libelle TEXT NOT NULL,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  -- Un des deux doit être > 0, pas les deux
  CHECK (
    (debit > 0 AND credit = 0) OR
    (debit = 0 AND credit > 0)
  ),
  piece_reference TEXT NOT NULL,        -- numéro facture/devis
  lettrage_code TEXT NULL,              -- pour rapprochement ultérieur
  -- Liens vers l'origine
  source_type TEXT NOT NULL,            -- 'facture', 'facture_st', 'facture_fournisseur'
  source_id UUID NOT NULL,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Pas de UPDATE autorisé : table append-only via RLS
);
CREATE INDEX idx_ecritures_date ON ecritures_comptables (date_ecriture);
CREATE INDEX idx_ecritures_source ON ecritures_comptables (source_type, source_id);
```

### Plan comptable configurable

```sql
CREATE TABLE plan_comptable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,            -- 411000, 70100, etc.
  libelle TEXT NOT NULL,
  type_operation TEXT NULL,             -- 'client', 'ventes_services', 'tva_collectee', ...
  actif BOOLEAN NOT NULL DEFAULT true
);
```

Seed avec un **PCG BTP standard** (à ajuster avec l'expert-comptable de l'entreprise utilisatrice).

### Génération des écritures

**À la validation d'une facture** (transition `statut` brouillon → émise), une Server Action écrit les écritures dans `ecritures_comptables` dans la même transaction que le changement de statut. Exemple pour une facture client TTC 1200 € (HT 1000 + TVA 200) :

| date | journal | compte | libellé | débit | crédit |
|---|---|---|---|---|---|
| 2026-04-15 | VTE | 411DUPONT | F-2026-000017 DUPONT SA | 1200,00 | 0,00 |
| 2026-04-15 | VTE | 70110 | F-2026-000017 Prestations BTP | 0,00 | 1000,00 |
| 2026-04-15 | VTE | 44571 | F-2026-000017 TVA 20% | 0,00 | 200,00 |

### Cas auto-liquidation TVA BTP (art. 283-2 nonies CGI)

Quand le client est un preneur assujetti et que les travaux entrent dans le périmètre :
- Facture **HT** sans TVA (mention obligatoire "Auto-liquidation — TVA due par le preneur")
- Écriture simplifiée : pas de compte `44571` chez nous
- Flag `auto_liquidation BOOLEAN` sur `factures`

| date | journal | compte | libellé | débit | crédit |
|---|---|---|---|---|---|
| 2026-04-15 | VTE | 411DUPONT | F-2026-000017 | 1000,00 | 0,00 |
| 2026-04-15 | VTE | 70110 | F-2026-000017 | 0,00 | 1000,00 |

### Formats cibles

#### Cegid Quadra

Format `.txt` à **largeur fixe** (spec Cegid Quadra Import ASCII). Chaque ligne = 1 écriture. Colonnes principales :

| Positions | Champ | Format |
|---|---|---|
| 1-5 | Code journal | AN 5 |
| 6-13 | Date (AAAAMMJJ) | N 8 |
| 14-21 | N° compte général | AN 8 |
| 22-39 | N° compte auxiliaire | AN 18 |
| 40-59 | Référence pièce | AN 20 |
| 60-89 | Libellé | AN 30 |
| 90-102 | Montant débit | N 13 (centimes, zero-padded) |
| 103-115 | Montant crédit | N 13 |

Adaptateur : `lib/accounting/exporters/cegid-quadra.ts`.

#### Sage 100

Format **XIMPORT** (.txt, séparateur tabulation). Colonnes :

`JournalCode \t Date \t NumeroCompte \t CompteAux \t Libelle \t DebitCredit \t Montant`

Adaptateur : `lib/accounting/exporters/sage-100.ts`.

#### FEC DGFiP

Format **pipe-separated** strict (spec officielle BOFiP). 18 colonnes. **Obligatoire en cas de contrôle fiscal**.

Même si non demandé explicitement par l'utilisateur, **à implémenter en M9** pour conformité légale de l'entreprise utilisatrice.

Adaptateur : `lib/accounting/exporters/fec.ts`.

### Paramétrage par utilisateur

Configuration exposée dans les paramètres admin :

- Plan comptable actif (seed par défaut, personnalisable)
- Mapping des libellés (personnalisable par type d'opération)
- Format par défaut (Cegid / Sage / les deux)
- Période d'export (mois, trimestre, intervalle custom)

### Plan d'implémentation

| Itération | Livrable |
|---|---|
| **M6** (Facturation) | Table `ecritures_comptables` + trigger/Server Action création auto à validation facture |
| **M9** (Documents admin) | Adaptateurs Cegid + Sage + FEC + UI export + page config plan comptable |
| **M10** (Reporting) | Dashboard rapprochement compta (écart `ecritures_comptables` vs. export) |

### Validation

**Jeu de tests** : fichiers de référence fournis par l'expert-comptable de l'entreprise utilisatrice (à collecter avant M9). Tests de bout-en-bout :

1. Générer une facture type
2. Exporter au format cible
3. Importer dans une instance de démo du logiciel cible
4. Vérifier que l'import est accepté sans correction manuelle

## Conséquences

### Positives

- Un seul modèle d'écriture à maintenir (le pivot).
- Ajouter un 3e logiciel = écrire un nouvel adaptateur, pas de refonte.
- **FEC conforme à la DGFiP** couvert par extension.
- Traçabilité via `source_type` + `source_id` → on peut remonter à la facture origine depuis n'importe quelle ligne d'écriture.
- Append-only → pas de risque de corruption historique.

### Négatives / Risques

- **Plan comptable sectoriel BTP** (PCG BTP 1982 adapté) demande un paramétrage par type d'opération → la table `plan_comptable` et le mapping sont critiques. **Mitigation** : collecter le plan comptable de l'entreprise utilisatrice avant M9.
- **Habitudes de libellés par expert-comptable** : chacun a son style. **Mitigation** : table `mapping_libelles` personnalisable.
- **Évolution des formats** Cegid/Sage : changement de version du logiciel comptable peut changer le format attendu. **Mitigation** : tests de non-régression avec fichiers de référence à jour.

### Mitigations

- Runbook `docs/runbooks/export-comptable.md` à créer en M9 (procédure mensuelle).
- Test Playwright : round-trip facture → export → re-parse → comparaison.

## Alternatives considérées

1. **Écriture directe au format Cegid/Sage sans pivot** — rejetée : impossible de maintenir 3+ formats sans dupliquer la logique métier.
2. **API directe Cegid/Sage** (intégration en temps réel) — rejetée : pas toutes les versions disposent d'API, l'utilisateur a demandé fichiers TXT.
3. **Uniquement FEC** (laisser l'expert-comptable importer) — rejetée : FEC n'est pas forcément compatible avec les modules import des logiciels du marché.
4. **Intégration via Factur-X uniquement** — rejetée : Factur-X est un format de facture, pas de pièce comptable. Usages complémentaires.

## Révision

À revisiter si :
- L'expert-comptable utilisateur passe sur un logiciel non listé (EBP, Ciel, etc.) → ajouter un adaptateur.
- Une API de comptabilité temps-réel devient nécessaire (Chorus Pro, fiduciaire numérique).
- Le calendrier de facturation électronique obligatoire FR impose une API PDP dédiée.
