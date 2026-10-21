import { describe, expect, it } from 'vitest';

import {
  affectationSchema,
  compteUtilisateurSchema,
  contratSchema,
  terminerContratSchema,
} from '@/lib/validation/test-sirh/collaborateurs';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID2 = '8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function chemins(r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[] }> } }) {
  return (r.error?.issues ?? []).map((i) => i.path.join('.'));
}

describe('affectationSchema', () => {
  const valide = {
    employeId: UUID,
    posteId: null,
    siteId: '',
    managerId: UUID2,
    horaireId: null,
    societeId: null,
    emailProfessionnel: 'marc.dubois@btp.fr',
    telephoneProfessionnel: '',
    dateAnciennete: '2015-05-01',
    notes: null,
  };

  it('accepte une affectation et normalise les vides', () => {
    const r = affectationSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ siteId: null, telephoneProfessionnel: null });
  });

  it('refuse d’être son propre manager et un email invalide', () => {
    expect(chemins(affectationSchema.safeParse({ ...valide, managerId: UUID }))).toEqual([
      'managerId',
    ]);
    expect(affectationSchema.safeParse({ ...valide, emailProfessionnel: 'marc@' }).success).toBe(
      false,
    );
  });
});

describe('compteUtilisateurSchema', () => {
  it('exige un identifiant de compte (texte, pas forcément UUID)', () => {
    expect(
      compteUtilisateurSchema.safeParse({ employeId: UUID, utilisateurId: 'usr_8f2kQ' }).success,
    ).toBe(true);
    expect(compteUtilisateurSchema.safeParse({ employeId: UUID, utilisateurId: ' ' }).success).toBe(
      false,
    );
  });
});

describe('contratSchema', () => {
  const cdi = {
    employeId: UUID,
    typeContrat: 'cdi',
    motifRecours: null,
    dateDebut: '2026-01-05',
    dateFin: null,
    dateFinPeriodeEssai: '2026-03-04',
    motifFin: null,
    posteId: null,
    intitulePoste: 'Maçon',
    categorie: 'ouvrier',
    niveau: 'N2',
    coefficient: '185',
    tempsTravail: 'temps_plein',
    heuresHebdo: '35',
    joursForfait: null,
    conventionCollective: 'BTP',
    societeId: null,
    siteId: null,
    salaireBrutMensuel: '2 450,50',
    tauxHoraireBrut: '',
    notes: null,
  };

  it('accepte un CDI et normalise montants et heures', () => {
    const r = contratSchema.safeParse(cdi);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      heuresHebdo: '35.00',
      salaireBrutMensuel: '2450.50',
      tauxHoraireBrut: null,
    });
  });

  it('CDD : date de fin et motif de recours obligatoires', () => {
    const r = contratSchema.safeParse({ ...cdi, typeContrat: 'cdd' });
    expect(chemins(r).sort()).toEqual(['dateFin', 'motifRecours']);
    expect(
      contratSchema.safeParse({
        ...cdi,
        typeContrat: 'cdd',
        dateFin: '2026-06-30',
        motifRecours: 'Accroissement temporaire d’activité',
      }).success,
    ).toBe(true);
  });

  it('apprentissage : date de fin requise, motif de recours facultatif', () => {
    expect(chemins(contratSchema.safeParse({ ...cdi, typeContrat: 'apprentissage' }))).toEqual([
      'dateFin',
    ]);
  });

  it('cohérence des dates (fin, essai, motif de fin)', () => {
    expect(
      chemins(
        contratSchema.safeParse({ ...cdi, dateFin: '2025-12-31', dateFinPeriodeEssai: null }),
      ),
    ).toEqual(['dateFin']);
    expect(chemins(contratSchema.safeParse({ ...cdi, dateFinPeriodeEssai: '2025-12-01' }))).toEqual(
      ['dateFinPeriodeEssai'],
    );
    expect(
      chemins(
        contratSchema.safeParse({
          ...cdi,
          dateFin: '2026-02-28',
          dateFinPeriodeEssai: '2026-03-04',
        }),
      ),
    ).toEqual(['dateFinPeriodeEssai']);
    expect(chemins(contratSchema.safeParse({ ...cdi, motifFin: 'demission' }))).toEqual([
      'dateFin',
    ]);
  });

  it('temps de travail : partiel < 35 h, forfait jours requis, plafond 48 h', () => {
    expect(chemins(contratSchema.safeParse({ ...cdi, tempsTravail: 'temps_partiel' }))).toEqual([
      'heuresHebdo',
    ]);
    expect(
      contratSchema.safeParse({ ...cdi, tempsTravail: 'temps_partiel', heuresHebdo: '24' }).success,
    ).toBe(true);
    expect(
      chemins(
        contratSchema.safeParse({ ...cdi, tempsTravail: 'forfait_jours', heuresHebdo: null }),
      ),
    ).toEqual(['joursForfait']);
    expect(
      contratSchema.safeParse({ ...cdi, tempsTravail: 'forfait_jours', joursForfait: '218' }).data
        ?.joursForfait,
    ).toBe(218);
    expect(contratSchema.safeParse({ ...cdi, heuresHebdo: '49' }).success).toBe(false);
  });
});

describe('terminerContratSchema', () => {
  it('exige date de fin et motif', () => {
    expect(
      terminerContratSchema.safeParse({ id: UUID, dateFin: '2026-12-31', motifFin: 'fin_cdd' })
        .success,
    ).toBe(true);
    expect(
      terminerContratSchema.safeParse({ id: UUID, dateFin: '', motifFin: 'fin_cdd' }).success,
    ).toBe(false);
    expect(
      terminerContratSchema.safeParse({ id: UUID, dateFin: '2026-12-31', motifFin: 'vacances' })
        .success,
    ).toBe(false);
  });
});
