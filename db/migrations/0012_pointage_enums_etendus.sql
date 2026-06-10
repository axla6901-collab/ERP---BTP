-- 0012_pointage_enums_etendus.sql
-- M5.3 : extension des enums pour absorber les données réelles du projet Pointage.
-- - type_pointage : ajout des valeurs "budget_*" et "pct_avancement_*"
-- - motif_absence : ajout des motifs métier réels (vacances, intempérie, etc.)
-- Schémas TypeScript miroir : db/schema/pointages.ts, db/schema/employes.ts
-- Appliquée via app_migrator. Idempotente (ALTER TYPE ... ADD VALUE IF NOT EXISTS).

-- =================================================================
-- 1. Élargir type_pointage
-- =================================================================
-- Nouveau panorama (réel + budget + % avancement, sur les 5 dimensions BTP gros œuvre)
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'budget_heures';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'budget_kg_acier_ha';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'budget_kg_acier_ts';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'budget_m3_beton_b16';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'budget_m3_beton_b25';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'pct_avancement_heures';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'pct_avancement_acier_ha';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'pct_avancement_acier_ts';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'pct_avancement_beton_b16';
ALTER TYPE type_pointage ADD VALUE IF NOT EXISTS 'pct_avancement_beton_b25';

-- =================================================================
-- 2. Élargir motif_absence
-- =================================================================
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'vacances';
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'intemperie';
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'naissance';
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'mariage';
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'deces';
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'ecole';
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'spou';
ALTER TYPE motif_absence ADD VALUE IF NOT EXISTS 'jps';
