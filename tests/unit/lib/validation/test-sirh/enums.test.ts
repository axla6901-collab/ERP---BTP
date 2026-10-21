import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { classificationEmploye } from '@/db/schema/employes';
import * as schema from '@/db/schema/test-sirh';
import * as E from '@/lib/validation/test-sirh/enums';

/**
 * Garde-fou : les listes TS (UI) doivent être le miroir EXACT des enums
 * Drizzle et de la migration SQL 0078 (même valeurs, même ordre).
 */
const MIROIRS: Array<[string, readonly string[], readonly string[]]> = [
  ['sirh_type_site', schema.sirhTypeSite.enumValues, E.TYPES_SITE],
  ['sirh_type_contrat', schema.sirhTypeContrat.enumValues, E.TYPES_CONTRAT],
  ['sirh_temps_travail', schema.sirhTempsTravail.enumValues, E.TEMPS_TRAVAIL],
  ['sirh_motif_fin_contrat', schema.sirhMotifFinContrat.enumValues, E.MOTIFS_FIN_CONTRAT],
  ['sirh_statut_periode_paie', schema.sirhStatutPeriodePaie.enumValues, E.STATUTS_PERIODE_PAIE],
  ['sirh_type_variable_paie', schema.sirhTypeVariablePaie.enumValues, E.TYPES_VARIABLE_PAIE],
  ['sirh_source_variable', schema.sirhSourceVariable.enumValues, E.SOURCES_VARIABLE],
  ['sirh_categorie_absence', schema.sirhCategorieAbsence.enumValues, E.CATEGORIES_ABSENCE],
  ['sirh_unite_decompte', schema.sirhUniteDecompte.enumValues, E.UNITES_DECOMPTE],
  ['sirh_statut_demande', schema.sirhStatutDemande.enumValues, E.STATUTS_DEMANDE],
  ['sirh_lieu_travail', schema.sirhLieuTravail.enumValues, E.LIEUX_TRAVAIL],
  ['sirh_source_badgeage', schema.sirhSourceBadgeage.enumValues, E.SOURCES_BADGEAGE],
  ['sirh_compensation_hs', schema.sirhCompensationHs.enumValues, E.COMPENSATIONS_HS],
  ['sirh_nature_frais', schema.sirhNatureFrais.enumValues, E.NATURES_FRAIS],
  ['sirh_categorie_frais', schema.sirhCategorieFrais.enumValues, E.CATEGORIES_FRAIS],
  ['sirh_statut_frais', schema.sirhStatutFrais.enumValues, E.STATUTS_FRAIS],
  ['sirh_statut_offre', schema.sirhStatutOffre.enumValues, E.STATUTS_OFFRE],
  ['sirh_source_candidat', schema.sirhSourceCandidat.enumValues, E.SOURCES_CANDIDAT],
  ['sirh_etape_candidature', schema.sirhEtapeCandidature.enumValues, E.ETAPES_CANDIDATURE],
  ['sirh_motif_refus', schema.sirhMotifRefus.enumValues, E.MOTIFS_REFUS],
  ['sirh_avis_recrutement', schema.sirhAvisRecrutement.enumValues, E.AVIS_RECRUTEMENT],
  ['sirh_type_entretien', schema.sirhTypeEntretien.enumValues, E.TYPES_ENTRETIEN],
  ['sirh_statut_campagne', schema.sirhStatutCampagne.enumValues, E.STATUTS_CAMPAGNE],
  ['sirh_statut_entretien', schema.sirhStatutEntretien.enumValues, E.STATUTS_ENTRETIEN],
  ['sirh_statut_objectif', schema.sirhStatutObjectif.enumValues, E.STATUTS_OBJECTIF],
  ['sirh_categorie_formation', schema.sirhCategorieFormation.enumValues, E.CATEGORIES_FORMATION],
  ['sirh_modalite_formation', schema.sirhModaliteFormation.enumValues, E.MODALITES_FORMATION],
  ['sirh_statut_session', schema.sirhStatutSession.enumValues, E.STATUTS_SESSION],
  ['sirh_statut_inscription', schema.sirhStatutInscription.enumValues, E.STATUTS_INSCRIPTION],
  ['sirh_resultat_formation', schema.sirhResultatFormation.enumValues, E.RESULTATS_FORMATION],
  ['sirh_type_processus', schema.sirhTypeProcessus.enumValues, E.TYPES_PROCESSUS],
  ['sirh_responsable_tache', schema.sirhResponsableTache.enumValues, E.RESPONSABLES_TACHE],
  ['sirh_statut_processus', schema.sirhStatutProcessus.enumValues, E.STATUTS_PROCESSUS],
  ['sirh_statut_tache', schema.sirhStatutTache.enumValues, E.STATUTS_TACHE],
  ['sirh_categorie_materiel', schema.sirhCategorieMateriel.enumValues, E.CATEGORIES_MATERIEL],
  ['sirh_statut_materiel', schema.sirhStatutMateriel.enumValues, E.STATUTS_MATERIEL],
  ['sirh_categorie_annonce', schema.sirhCategorieAnnonce.enumValues, E.CATEGORIES_ANNONCE],
];

/** Enums déclarés dans la migration 0078 : `('nom', ARRAY['a','b',…])`. */
function enumsMigration(): Map<string, string[]> {
  const sqlPath = path.resolve(__dirname, '../../../../../db/migrations/0078_test_sirh_module.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const res = new Map<string, string[]>();
  for (const m of sql.matchAll(/\('(sirh_[a-z_]+)',\s*ARRAY\[([^\]]*)\]\)/g)) {
    const valeurs = [...m[2]!.matchAll(/'([^']+)'/g)].map((v) => v[1]!);
    res.set(m[1]!, valeurs);
  }
  return res;
}

describe('enums Test SIRH', () => {
  it.each(MIROIRS)('%s : TS ≡ Drizzle', (_nom, drizzle, ts) => {
    expect([...ts]).toEqual([...drizzle]);
  });

  it('chaque enum Drizzle est déclaré à l’identique dans la migration 0078', () => {
    const sql = enumsMigration();
    expect(sql.size).toBe(MIROIRS.length);
    for (const [nom, drizzle] of MIROIRS) {
      expect(sql.get(nom), nom).toEqual([...drizzle]);
    }
  });

  it('les catégories professionnelles reprennent l’enum RH existant', () => {
    expect([...E.CATEGORIES_PROFESSIONNELLES]).toEqual([...classificationEmploye.enumValues]);
  });

  it('les sous-ensembles métier ne contiennent que des valeurs valides', () => {
    for (const v of E.TYPES_CONTRAT_A_TERME) expect(E.TYPES_CONTRAT).toContain(v);
    for (const v of E.STATUTS_DEMANDE_ACTIFS) expect(E.STATUTS_DEMANDE).toContain(v);
    for (const v of [...E.ETAPES_PIPELINE, ...E.ETAPES_CLOSES]) {
      expect(E.ETAPES_CANDIDATURE).toContain(v);
    }
    expect(new Set([...E.ETAPES_PIPELINE, ...E.ETAPES_CLOSES]).size).toBe(
      E.ETAPES_CANDIDATURE.length,
    );
  });
});
