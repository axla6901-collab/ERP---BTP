-- 0020_lignes_situation.sql
-- Refonte des situations de travaux : passage d'un modèle 1 % global à un
-- modèle multi-lignes (un poste par ligne, chaque ligne avec son propre %
-- d'avancement cumulé). Conforme à la convention CCAG-T détaillée.
--
-- Workflow nouveau : le client transmet un document détaillé (Excel/CSV)
-- qui liste les postes avec leur % validé. L'utilisateur importe ce fichier
-- ou saisit les lignes manuellement, puis enrichit chaque ligne avec un
-- article du catalogue (optionnel).
--
-- Les colonnes agrégées sur situations_travaux (montant_marche_ht, etc.)
-- restent mais sont désormais CALCULÉES en application à partir des lignes.
--
-- Migration data : chaque situation existante reçoit 1 ligne unique
-- « Avancement global » avec les valeurs déjà saisies.
--
-- Idempotent.

-- =================================================================
-- 1. Table lignes_situation
-- =================================================================

CREATE TABLE IF NOT EXISTS lignes_situation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  situation_id UUID NOT NULL REFERENCES situations_travaux(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  -- Lien vers la ligne équivalente de la situation précédente (pour faciliter
  -- le calcul du delta et tracer la continuité d'un poste à travers le temps).
  ligne_precedente_id UUID REFERENCES lignes_situation(id) ON DELETE SET NULL,
  designation TEXT NOT NULL,
  -- Lien optionnel à un article du catalogue (enrichissement métier).
  article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
  -- Mode hybride : soit l'utilisateur saisit qty + PU (et montant_marche_ht
  -- est calculé), soit il saisit directement montant_marche_ht. Toujours
  -- requis : montant_marche_ht (au moins via le calcul).
  quantite NUMERIC(14, 4),
  unite TEXT,
  prix_unitaire_ht NUMERIC(14, 2),
  montant_marche_ht NUMERIC(14, 2) NOT NULL,
  pct_avancement_cumule NUMERIC(5, 2) NOT NULL,
  -- Montants calculés (figés au moment de la sauvegarde de la situation)
  montant_cumule_ht NUMERIC(14, 2) NOT NULL,
  montant_situation_precedente_ht NUMERIC(14, 2) NOT NULL DEFAULT 0,
  montant_a_facturer_ht NUMERIC(14, 2) NOT NULL,
  notes TEXT,
  CONSTRAINT chk_lignes_situation_pct_range
    CHECK (pct_avancement_cumule >= 0 AND pct_avancement_cumule <= 100),
  CONSTRAINT chk_lignes_situation_marche_pos
    CHECK (montant_marche_ht > 0)
);

CREATE INDEX IF NOT EXISTS idx_lignes_situation_situation
  ON lignes_situation (situation_id, ordre);
CREATE INDEX IF NOT EXISTS idx_lignes_situation_article
  ON lignes_situation (article_id)
  WHERE article_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lignes_situation_precedente
  ON lignes_situation (ligne_precedente_id)
  WHERE ligne_precedente_id IS NOT NULL;

-- =================================================================
-- 2. Migration data : créer 1 ligne par situation existante
-- =================================================================
-- Idempotent : on n'insère que pour les situations qui n'ont AUCUNE ligne.

INSERT INTO lignes_situation (
  situation_id,
  ordre,
  designation,
  montant_marche_ht,
  pct_avancement_cumule,
  montant_cumule_ht,
  montant_situation_precedente_ht,
  montant_a_facturer_ht
)
SELECT
  s.id,
  0,
  'Avancement global (migration depuis situation simple)',
  s.montant_marche_ht,
  s.pct_avancement_cumule,
  s.montant_cumule_ht,
  s.montant_situation_precedente_ht,
  s.montant_a_facturer_ht
FROM situations_travaux s
WHERE NOT EXISTS (
  SELECT 1 FROM lignes_situation l WHERE l.situation_id = s.id
);

-- =================================================================
-- 3. Assouplir la contrainte de cohérence sur situations_travaux
-- =================================================================
-- L'ancienne contrainte vérifiait que montant_a_facturer = cumule - precedent
-- AU NIVEAU SITUATION. Avec le nouveau modèle, c'est l'application qui
-- garantit la cohérence en recalculant ces colonnes à partir des lignes.
-- On garde quand même la contrainte (elle reste valide) — pas de modification.

-- (Aucune ALTER TABLE nécessaire : situations_travaux conserve ses colonnes
-- comme cache agrégé. C'est l'app qui les met à jour à chaque save.)
