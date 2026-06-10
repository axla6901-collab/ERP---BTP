-- 0014_motif_entreprise.sql
-- Ajoute le motif d'absence "entreprise" (absence motivée par l'employeur :
-- congé exceptionnel, fermeture, etc.). Cohérent avec les 5 motifs simplifiés
-- utilisés dans la matrice de saisie : absence, formation, maladie, entreprise, école.
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'entreprise';
