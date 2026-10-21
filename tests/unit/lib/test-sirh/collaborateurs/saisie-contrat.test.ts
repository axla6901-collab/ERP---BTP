import { describe, expect, it } from 'vitest';

import {
  appliquerPoste,
  appliquerPrefillFicheRh,
  valeursContratParDefaut,
  type ContratEditable,
  type PrefillFicheRh,
} from '@/lib/test-sirh/collaborateurs/saisie-contrat';
import { contratSchema } from '@/lib/validation/test-sirh/collaborateurs';

const EMPLOYE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const POSTE = '8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const TODAY = '2026-10-19';

const prefill: PrefillFicheRh = {
  typeContrat: 'cdd',
  dateDebut: '2026-03-02',
  dateFin: '2026-12-31',
  intitulePoste: 'Coffreur',
  categorie: 'ouvrier',
  coefficient: '185',
  heuresHebdo: '24.00',
  conventionCollective: 'Bâtiment',
  salaireBrutMensuel: '1850.00',
  tauxHoraireBrut: '17.80',
};

describe('valeursContratParDefaut', () => {
  it('nouvelle version : CDI temps plein 35 h démarrant aujourd’hui, schéma valide', () => {
    const v = valeursContratParDefaut(EMPLOYE, null, TODAY);
    expect(v).toMatchObject({
      employeId: EMPLOYE,
      typeContrat: 'cdi',
      dateDebut: TODAY,
      tempsTravail: 'temps_plein',
      heuresHebdo: '35',
      conventionCollective: 'BTP',
      salaireBrutMensuel: null,
    });
    expect(Object.keys(v)).toHaveLength(Object.keys(contratSchema.shape).length);
    expect(contratSchema.safeParse(v).success).toBe(true);
  });

  it('édition : reprend la version existante telle quelle', () => {
    const existant: ContratEditable = {
      id: '1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      typeContrat: 'cdi',
      motifRecours: null,
      dateDebut: '2024-01-08',
      dateFin: null,
      dateFinPeriodeEssai: null,
      motifFin: null,
      posteId: null,
      intitulePoste: 'Chef d’équipe',
      categorie: 'etam',
      niveau: 'E',
      coefficient: null,
      tempsTravail: 'forfait_jours',
      heuresHebdo: null,
      joursForfait: 218,
      conventionCollective: null,
      societeId: null,
      siteId: null,
      notes: null,
      salaireBrutMensuel: null,
      tauxHoraireBrut: null,
    };
    const v = valeursContratParDefaut(EMPLOYE, existant, TODAY);
    expect(v).toMatchObject({
      id: existant.id,
      heuresHebdo: null,
      joursForfait: 218,
      conventionCollective: null,
    });
  });
});

describe('appliquerPrefillFicheRh', () => {
  const base = valeursContratParDefaut(EMPLOYE, null, TODAY);

  it('reprend la fiche RH et déduit le temps partiel (< 35 h)', () => {
    const v = appliquerPrefillFicheRh(base, prefill, true);
    expect(v).toMatchObject({
      typeContrat: 'cdd',
      dateDebut: '2026-03-02',
      dateFin: '2026-12-31',
      intitulePoste: 'Coffreur',
      categorie: 'ouvrier',
      coefficient: '185',
      tempsTravail: 'temps_partiel',
      heuresHebdo: '24.00',
      joursForfait: null,
      salaireBrutMensuel: '1850.00',
      tauxHoraireBrut: '17.80',
    });
  });

  it('sans droit PAIE, la rémunération de la fiche n’est pas reprise', () => {
    const v = appliquerPrefillFicheRh(base, prefill, false);
    expect(v.salaireBrutMensuel).toBeNull();
    expect(v.tauxHoraireBrut).toBeNull();
  });

  it('garde la date du formulaire si la fiche n’en a pas', () => {
    const v = appliquerPrefillFicheRh(
      base,
      { ...prefill, dateDebut: null, heuresHebdo: '39.00' },
      true,
    );
    expect(v.dateDebut).toBe(TODAY);
    expect(v.tempsTravail).toBe('temps_plein');
  });
});

describe('appliquerPoste', () => {
  const base = { ...valeursContratParDefaut(EMPLOYE, null, TODAY), niveau: 'N1' };

  it('fige l’intitulé et reprend la classification du poste', () => {
    const v = appliquerPoste(base, {
      id: POSTE,
      label: 'Maçon (N2)',
      intitule: 'Maçon',
      categorie: 'ouvrier',
      niveau: 'N2',
      coefficient: null,
    });
    expect(v).toMatchObject({
      posteId: POSTE,
      intitulePoste: 'Maçon',
      categorie: 'ouvrier',
      niveau: 'N2',
      coefficient: null,
    });
  });

  it('désélection : retire le poste sans effacer les champs saisis', () => {
    const v = appliquerPoste({ ...base, posteId: POSTE, intitulePoste: 'Maçon' }, null);
    expect(v.posteId).toBeNull();
    expect(v.intitulePoste).toBe('Maçon');
  });
});
