-- 0024_composants_ligne_devis.sql
-- Composants articles attachés à une ligne de devis : permettent de
-- « chiffrer » le coût d'une ligne (typiquement importée depuis un DPGF
-- prospect) à partir d'un ou plusieurs articles du catalogue.
--
-- Le PU d'une ligne ayant des composants devient calculé :
--   PU_ligne = Σ (composant.quantite_par_unite × composant.prix_unitaire_ht)
-- Sans composant, le PU reste saisi manuellement comme aujourd'hui.
--
-- Schéma TypeScript miroir : db/schema/commercial.ts
-- Idempotente.

CREATE TABLE IF NOT EXISTS composants_ligne_devis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ligne_devis_id UUID NOT NULL REFERENCES lignes_devis(id) ON DELETE CASCADE,
  ordre INTEGER NOT NULL,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE RESTRICT,
  /** Consommation par unité de la ligne parent
   *  (ex : 12 agglos par m² de mur). */
  quantite_par_unite NUMERIC(14, 4) NOT NULL,
  /** Snapshot du PU de l'article au moment de l'attachement, pour figer
   *  le coût même si le prix catalogue évolue ensuite. */
  prix_unitaire_ht NUMERIC(14, 2) NOT NULL,
  notes TEXT,
  CONSTRAINT chk_composants_qpu_pos CHECK (quantite_par_unite > 0),
  CONSTRAINT chk_composants_pu_nonneg CHECK (prix_unitaire_ht >= 0)
);

CREATE INDEX IF NOT EXISTS idx_composants_ligne
  ON composants_ligne_devis (ligne_devis_id, ordre);
