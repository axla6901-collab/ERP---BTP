-- 0061_st_cascade_retenue.sql
-- M8.1 — Cascade de sous-traitance + taux de retenue de garantie.
-- Schéma TypeScript miroir : db/schema/tiers.ts (sousTraitants).
-- Validation : lib/validation/tiers.ts (sousTraitantSchema).
--
-- Loi 75-1334 : la sous-traitance « en chaîne » est encadrée. On modélise la
-- cascade par une FK auto-réflexive `parent_st_id` (le ST « parent » est le
-- donneur d'ordre interne), bornée à 3 niveaux et sans cycle (trigger).
--
-- `taux_retenue_garantie` (0–10 %, CCAG / marché) sert de défaut applicatif :
-- il est copié (figé) sur le contrat ST à sa création, puis sur la facture ST.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS, DROP/ADD CONSTRAINT, CREATE OR REPLACE).

BEGIN;

ALTER TABLE sous_traitants
  ADD COLUMN IF NOT EXISTS parent_st_id UUID REFERENCES sous_traitants(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS taux_retenue_garantie NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Retenue de garantie bornée 0–10 % (aligné sur factures.retenue_garantie_pct).
ALTER TABLE sous_traitants DROP CONSTRAINT IF EXISTS chk_sous_traitants_taux_retenue;
ALTER TABLE sous_traitants
  ADD CONSTRAINT chk_sous_traitants_taux_retenue
    CHECK (taux_retenue_garantie >= 0 AND taux_retenue_garantie <= 10);

-- Un ST ne peut pas être son propre parent (cycle de longueur 1).
-- Les cycles plus longs et la profondeur > 3 sont gérés par le trigger.
ALTER TABLE sous_traitants DROP CONSTRAINT IF EXISTS chk_sous_traitants_parent_self;
ALTER TABLE sous_traitants
  ADD CONSTRAINT chk_sous_traitants_parent_self
    CHECK (parent_st_id IS NULL OR parent_st_id <> id);

CREATE INDEX IF NOT EXISTS idx_sous_traitants_parent
  ON sous_traitants (parent_st_id) WHERE deleted_at IS NULL;

-- =================================================================
-- Trigger anti-cycle + profondeur ≤ 3 sur la chaîne parent_st_id.
--
-- SECURITY INVOKER (défaut) : exécuté avec les droits de l'appelant (app_rw)
-- sous la policy RLS p_tenant. La remontée de chaîne ne « voit » donc que les
-- ST du tenant courant ; un parent cross-tenant est invisible → NOT FOUND →
-- exception (défense en profondeur, en plus du contrôle entreprise_id explicite
-- utile si l'appelant a BYPASSRLS).
-- =================================================================

CREATE OR REPLACE FUNCTION trg_st_anti_cycle() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_current uuid := NEW.parent_st_id;
  v_depth   int  := 1;          -- NEW est le niveau 1 ; chaque parent ajoute un niveau
  v_eid     uuid;
BEGIN
  IF NEW.parent_st_id IS NULL THEN
    RETURN NEW;
  END IF;

  WHILE v_current IS NOT NULL LOOP
    v_depth := v_depth + 1;
    IF v_depth > 3 THEN
      RAISE EXCEPTION 'Cascade de sous-traitance limitée à 3 niveaux (parent_st_id)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_current = NEW.id THEN
      RAISE EXCEPTION 'Cycle détecté dans la chaîne de sous-traitance (parent_st_id)'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT parent_st_id, entreprise_id
      INTO v_current, v_eid
      FROM sous_traitants
      WHERE id = v_current AND deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sous-traitant parent introuvable (parent_st_id)'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_eid <> NEW.entreprise_id THEN
      RAISE EXCEPTION 'Le parent de sous-traitance appartient à une autre entreprise (parent_st_id)'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_st_anti_cycle ON sous_traitants;
CREATE TRIGGER trg_st_anti_cycle
  BEFORE INSERT OR UPDATE OF parent_st_id ON sous_traitants
  FOR EACH ROW EXECUTE FUNCTION trg_st_anti_cycle();

COMMIT;
