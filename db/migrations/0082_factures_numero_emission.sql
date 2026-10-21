-- =================================================================
-- 0082 — Numéro légal de facture attribué à l'ÉMISSION.
--
-- Jusqu'ici `creerFacture` et `genererFactureDepuisSituation` consommaient un
-- numéro de la séquence (`generate_numero('facture')`) dès la création du
-- BROUILLON. Un brouillon pouvant être supprimé, chaque suppression laissait un
-- trou dans la séquence, alors que la numérotation des factures doit être
-- continue et chronologique (CGI art. 242 nonies A).
--
-- Désormais :
--   - un brouillon n'a pas de numéro (numero NULL) ;
--   - le numéro est attribué au passage « émise » (`changerStatutFacture`) ;
--   - toute facture sortie du brouillon porte un numéro, sauf un brouillon
--     annulé sans avoir été émis (CHECK ci-dessous).
-- L'index unique `uq_factures_entreprise_numero` (0042) tolère plusieurs NULL.
--
-- Les factures existantes gardent leur numéro (toutes en ont un) : la
-- contrainte est validée sans reprise de données.
-- Idempotent. Appliquer en app_migrator (propriétaire de la table).
-- =================================================================

BEGIN;

ALTER TABLE factures ALTER COLUMN numero DROP NOT NULL;

ALTER TABLE factures DROP CONSTRAINT IF EXISTS chk_factures_numero_emise;
ALTER TABLE factures ADD CONSTRAINT chk_factures_numero_emise
  CHECK (numero IS NOT NULL OR statut IN ('brouillon', 'annulee'));

COMMIT;
