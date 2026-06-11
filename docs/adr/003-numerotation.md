# ADR-003 — Numérotation des documents métier

- **Statut** : Accepté
- **Date** : 2026-04-21
- **Décideur** : @aacosta

## Contexte

Plusieurs entités nécessitent un **numéro lisible** :

- `DEVIS.numero`
- `FACTURE.numero` — **obligation légale FR** : séquence continue, pas de trou, archivée 10 ans (art. L123-22 C. com.)
- `COMMANDE.numero`
- `CONTRAT_ST.numero`
- `FACTURE_ST.numero`
- `SITUATION_TRAVAUX.numero_situation` — séquentielle **par chantier**

Ce point est **chaud en concurrence** : deux transactions simultanées ne doivent jamais produire le même numéro. L'anti-pattern `MAX(numero) + 1` est formellement interdit.

## Décision

### Format universel

Tous les numéros applicatifs suivent le format :

```
<PRÉFIXE>-<ANNÉE>-<SÉQUENCE 6 chiffres>
```

| Document               | Préfixe | Exemple           |
| ---------------------- | ------- | ----------------- |
| Devis                  | `D`     | `D-2026-000042`   |
| Facture                | `F`     | `F-2026-000017`   |
| Commande               | `C`     | `C-2026-000231`   |
| Contrat sous-traitance | `ST`    | `ST-2026-000004`  |
| Facture sous-traitant  | `FST`   | `FST-2026-000019` |

La séquence **redémarre à 1 au 1er janvier** de chaque année (pratique FR standard, cohérent avec l'exercice comptable).

### Génération

**Une séquence Postgres dédiée par `(type, année)`** :

```sql
CREATE SEQUENCE IF NOT EXISTS seq_facture_2026 START 1 INCREMENT 1 NO CYCLE;
```

**Fonction PL/pgSQL** `generate_numero(p_type TEXT)` :

```sql
CREATE OR REPLACE FUNCTION generate_numero(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_seq_name TEXT := format('seq_%s_%s', lower(p_type), v_year);
  v_next INTEGER;
  v_prefix TEXT;
BEGIN
  v_prefix := CASE lower(p_type)
    WHEN 'devis'      THEN 'D'
    WHEN 'facture'    THEN 'F'
    WHEN 'commande'   THEN 'C'
    WHEN 'contrat_st' THEN 'ST'
    WHEN 'facture_st' THEN 'FST'
    ELSE NULL
  END;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Type de numéro inconnu: %', p_type;
  END IF;

  -- Création idempotente de la séquence pour l'année en cours
  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS %I START 1 INCREMENT 1 NO CYCLE',
    v_seq_name
  );

  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_next;

  -- Journalisation pour audit (registre annuel)
  INSERT INTO numeros_attribues (type_doc, annee, sequence, numero_complet, attribue_at)
  VALUES (p_type, v_year, v_next, format('%s-%s-%s', v_prefix, v_year, lpad(v_next::TEXT, 6, '0')), now());

  RETURN format('%s-%s-%s', v_prefix, v_year, lpad(v_next::TEXT, 6, '0'));
END;
$$;
```

**Garanties** :

- `nextval` est **atomique** en Postgres (pas de `MAX() + 1` jamais).
- La séquence est persistée dans le catalogue (survit au redémarrage).
- Le **registre** `numeros_attribues` trace **tout** numéro attribué (même en cas de rollback applicatif), ce qui permet de justifier une séquence non-continue en cas de contrôle fiscal.

### Cas particulier : SITUATION_TRAVAUX

`SITUATION_TRAVAUX.numero_situation INTEGER` : séquence **par chantier**, pas globale.

```sql
-- Contrainte d'unicité
ALTER TABLE situations_travaux
  ADD CONSTRAINT uq_situation_par_chantier
  UNIQUE (chantier_id, numero_situation);

-- Fonction de génération atomique
CREATE OR REPLACE FUNCTION generate_numero_situation(p_chantier_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  -- Verrou sur le chantier pour sérialiser les générations concurrentes
  PERFORM 1 FROM chantiers WHERE id = p_chantier_id FOR UPDATE;

  SELECT COALESCE(MAX(numero_situation), 0) + 1
    INTO v_next
    FROM situations_travaux
   WHERE chantier_id = p_chantier_id;

  RETURN v_next;
END;
$$;
```

### Registre des numéros attribués

```sql
CREATE TABLE numeros_attribues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_doc TEXT NOT NULL,
  annee INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  numero_complet TEXT NOT NULL,
  attribue_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type_doc, annee, sequence)
);
```

Ce registre est **append-only** (aucun UPDATE/DELETE autorisé via RLS) et sert de **preuve** que la séquence a bien été attribuée, même si la transaction applicative échoue ensuite.

### Ouverture annuelle

Le 1er janvier, les nouvelles séquences sont créées **automatiquement à la première demande** (via `CREATE SEQUENCE IF NOT EXISTS` dans la fonction). Un job de vérification quotidien (M1) vérifie que les séquences existent pour l'année en cours.

## Conséquences

### Positives

- Format lisible, triable chronologiquement, reconnaissable visuellement.
- Atomicité garantie (pas de collision possible).
- Auditabilité totale via `numeros_attribues`.
- Pas de dépendance applicative : si le code plante, Postgres garantit encore l'unicité.

### Négatives / Risques

- **Rollback applicatif** = saut de numéro dans la séquence `nextval`. **Mitigation** : registre `numeros_attribues` documenté comme preuve. La tolérance administrative FR accepte des trous si justifiés.
- **Changement d'année à minuit** : risque de 2 séquences actives pendant quelques secondes. **Mitigation** : la fonction utilise toujours l'année de `now()` → pas de double séquence, juste la nouvelle qui démarre.
- **Migration / import de données historiques** : les numéros historiques peuvent ne pas respecter le format. **Mitigation** : `CHECK` lâche sur `numero` (longueur min), validation stricte uniquement à la génération.

### Mitigations

- Registre `numeros_attribues` documenté dans [docs/runbooks/audit-fiscal.md](../runbooks/audit-fiscal.md) (à créer M1).
- Test unitaire de la fonction `generate_numero` couvrant : concurrence simulée, passage d'année, préfixe inconnu.

## Alternatives considérées

1. **Unicité globale (pas de reset annuel)** — rejetée : pratique FR standard = reset annuel, cohérence avec l'exercice comptable.
2. **Numérotation côté application (UUID visible)** — rejetée : non-séquentiel, non-auditable, viole l'obligation FR de séquence continue pour les factures.
3. **Table `counters` avec verrouillage applicatif** — rejetée : re-implémente mal ce que `nextval` fait nativement, risque de deadlock.
4. **Utiliser l'ID UUID comme numéro** — rejetée : illisible pour les utilisateurs et clients.

## Révision

À revisiter si :

- L'administration fiscale renforce l'exigence de continuité stricte (alors : passer à un mécanisme garantissant zéro saut, potentiellement via 2-phase commit).
- Introduction d'un multi-établissement : préfixe par établissement (`D-PAR-2026-000042` vs `D-LYO-2026-000042`).
