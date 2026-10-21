import { describe, expect, it } from 'vitest';

import {
  ajoutCandidatureSchema,
  avisCandidatureSchema,
  candidatSchema,
  changementStatutOffreSchema,
  commentaireCandidatureSchema,
  embaucheSchema,
  entretienCandidatureSchema,
  etapeCandidatureSchema,
  noteCandidatureSchema,
  offreSchema,
  refusCandidatureSchema,
} from '@/lib/validation/test-sirh/recrutement';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID2 = '7a1c2b3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

/** Messages d'erreur d'un champ après `safeParse`. */
function erreurs(
  result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } },
  champ: string,
) {
  return (result.error?.issues ?? []).filter((i) => i.path[0] === champ).map((i) => i.message);
}

describe('offreSchema', () => {
  const valide = {
    reference: 'REC-2026-01',
    titre: 'Maçon coffreur (H/F)',
    posteId: UUID,
    siteId: null,
    typeContrat: 'cdi',
    description: 'Gros œuvre sur chantiers de logements collectifs.',
    profilRecherche: null,
    nbPostes: '2',
    salaireMin: '2 100',
    salaireMax: '2400,50',
    statut: 'brouillon',
    datePublication: '',
    dateCloture: null,
    responsableId: '',
  };

  it('accepte une offre complète et normalise les valeurs', () => {
    const r = offreSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      nbPostes: 2,
      salaireMin: '2100.00',
      salaireMax: '2400.50',
      datePublication: null,
      responsableId: null,
      siteId: null,
    });
  });

  it('exige un titre et un nombre de postes entre 1 et 999', () => {
    expect(offreSchema.safeParse({ ...valide, titre: '  ' }).success).toBe(false);
    expect(offreSchema.safeParse({ ...valide, nbPostes: 0 }).success).toBe(false);
    expect(offreSchema.safeParse({ ...valide, nbPostes: 1000 }).success).toBe(false);
    expect(offreSchema.safeParse({ ...valide, nbPostes: '1,5' }).success).toBe(false);
  });

  it('refuse un type de contrat ou un statut inconnu', () => {
    expect(offreSchema.safeParse({ ...valide, typeContrat: 'freelance' }).success).toBe(false);
    expect(offreSchema.safeParse({ ...valide, statut: 'archivee' }).success).toBe(false);
  });

  it('fourchette de salaire : min ≤ max', () => {
    const r = offreSchema.safeParse({ ...valide, salaireMin: '3000', salaireMax: '2500' });
    expect(r.success).toBe(false);
    expect(erreurs(r, 'salaireMax')[0]).toMatch(/supérieur ou égal/);
    expect(
      offreSchema.safeParse({ ...valide, salaireMin: '2500', salaireMax: '2500' }).success,
    ).toBe(true);
    expect(offreSchema.safeParse({ ...valide, salaireMin: '-5' }).success).toBe(false);
  });

  it('dates : la clôture suit la publication', () => {
    const r = offreSchema.safeParse({
      ...valide,
      datePublication: '2026-10-19',
      dateCloture: '2026-10-01',
    });
    expect(r.success).toBe(false);
    expect(erreurs(r, 'dateCloture')[0]).toMatch(/clôture/);
  });

  it('changement de statut : identifiant et statut valides', () => {
    expect(changementStatutOffreSchema.safeParse({ id: UUID, statut: 'publiee' }).success).toBe(
      true,
    );
    expect(changementStatutOffreSchema.safeParse({ id: 'x', statut: 'publiee' }).success).toBe(
      false,
    );
  });
});

describe('candidatSchema', () => {
  const valide = {
    nom: 'Durand',
    prenom: 'Léa',
    email: 'lea.durand@exemple.fr',
    telephone: '06 12 34 56 78',
    ville: 'Lyon',
    source: 'france_travail',
    consentementRgpd: true,
    dateConsentement: '2026-10-19',
    notes: null,
  };

  it('accepte un candidat complet', () => {
    expect(candidatSchema.safeParse(valide).success).toBe(true);
  });

  it('exige nom et prénom, un email valide et une source connue', () => {
    expect(candidatSchema.safeParse({ ...valide, nom: '' }).success).toBe(false);
    expect(candidatSchema.safeParse({ ...valide, prenom: '' }).success).toBe(false);
    expect(candidatSchema.safeParse({ ...valide, email: 'lea@' }).success).toBe(false);
    expect(candidatSchema.safeParse({ ...valide, source: 'linkedin' }).success).toBe(false);
    expect(candidatSchema.safeParse({ ...valide, email: '' }).data?.email).toBeNull();
  });

  it('consentement RGPD : date obligatoire quand il est recueilli', () => {
    const r = candidatSchema.safeParse({ ...valide, dateConsentement: null });
    expect(r.success).toBe(false);
    expect(erreurs(r, 'dateConsentement')[0]).toMatch(/consentement/);
    expect(
      candidatSchema.safeParse({ ...valide, consentementRgpd: false, dateConsentement: null })
        .success,
    ).toBe(true);
  });
});

describe('ajoutCandidatureSchema', () => {
  const base = {
    offreId: UUID,
    mode: 'existant',
    candidatId: UUID2,
    nom: null,
    prenom: null,
    email: null,
    telephone: null,
    source: 'candidature_spontanee',
    consentementRgpd: false,
    dateCandidature: '2026-10-19',
    commentaire: null,
  };

  it('mode existant : candidat obligatoire', () => {
    expect(ajoutCandidatureSchema.safeParse(base).success).toBe(true);
    const r = ajoutCandidatureSchema.safeParse({ ...base, candidatId: null });
    expect(r.success).toBe(false);
    expect(erreurs(r, 'candidatId')).toEqual(['Choisissez un candidat.']);
  });

  it('mode nouveau : nom et prénom obligatoires', () => {
    const r = ajoutCandidatureSchema.safeParse({ ...base, mode: 'nouveau', candidatId: null });
    expect(r.success).toBe(false);
    expect(erreurs(r, 'nom')).toEqual(['Nom requis.']);
    expect(erreurs(r, 'prenom')).toEqual(['Prénom requis.']);
    expect(
      ajoutCandidatureSchema.safeParse({
        ...base,
        mode: 'nouveau',
        candidatId: null,
        nom: 'Martin',
        prenom: 'Hugo',
        email: 'hugo@exemple.fr',
      }).success,
    ).toBe(true);
  });

  it('date de candidature obligatoire', () => {
    expect(ajoutCandidatureSchema.safeParse({ ...base, dateCandidature: '' }).success).toBe(false);
  });
});

describe('pipeline : étapes, refus, entretien, note, commentaire', () => {
  it('étape : valeur de l’énumération', () => {
    expect(etapeCandidatureSchema.safeParse({ id: UUID, etape: 'entretien_rh' }).success).toBe(
      true,
    );
    expect(etapeCandidatureSchema.safeParse({ id: UUID, etape: 'archivee' }).success).toBe(false);
  });

  it('refus : motif obligatoire', () => {
    const r = refusCandidatureSchema.safeParse({ id: UUID, commentaire: null });
    expect(r.success).toBe(false);
    expect(erreurs(r, 'motifRefus')).toEqual(['Motif de refus obligatoire.']);
    expect(
      refusCandidatureSchema.safeParse({
        id: UUID,
        motifRefus: 'experience_insuffisante',
        commentaire: '',
      }).data?.commentaire,
    ).toBeNull();
  });

  it('entretien : date et heure ensemble, ou aucune des deux', () => {
    expect(
      entretienCandidatureSchema.safeParse({ id: UUID, date: '2026-10-20', heure: '14:00' })
        .success,
    ).toBe(true);
    expect(entretienCandidatureSchema.safeParse({ id: UUID, date: '', heure: '' }).success).toBe(
      true,
    );
    const sansHeure = entretienCandidatureSchema.safeParse({
      id: UUID,
      date: '2026-10-20',
      heure: null,
    });
    expect(erreurs(sansHeure, 'heure')[0]).toMatch(/Heure/);
    const sansDate = entretienCandidatureSchema.safeParse({ id: UUID, date: null, heure: '09:00' });
    expect(erreurs(sansDate, 'date')[0]).toMatch(/Date/);
  });

  it('note de 1 à 5 ou vide', () => {
    expect(noteCandidatureSchema.safeParse({ id: UUID, note: 5 }).success).toBe(true);
    expect(noteCandidatureSchema.safeParse({ id: UUID, note: null }).data?.note).toBeNull();
    expect(noteCandidatureSchema.safeParse({ id: UUID, note: 6 }).success).toBe(false);
    expect(noteCandidatureSchema.safeParse({ id: UUID, note: 0 }).success).toBe(false);
  });

  it('commentaire borné à 2000 caractères', () => {
    expect(
      commentaireCandidatureSchema.safeParse({ id: UUID, commentaire: 'x'.repeat(2001) }).success,
    ).toBe(false);
  });
});

describe('avisCandidatureSchema', () => {
  it('avis favorable / réservé / défavorable, note facultative', () => {
    expect(
      avisCandidatureSchema.safeParse({
        candidatureId: UUID,
        note: '4',
        avis: 'favorable',
        commentaire: 'Très bon contact chantier.',
      }).data,
    ).toEqual({
      candidatureId: UUID,
      note: 4,
      avis: 'favorable',
      commentaire: 'Très bon contact chantier.',
    });
    expect(
      avisCandidatureSchema.safeParse({
        candidatureId: UUID,
        note: null,
        avis: 'mitige',
        commentaire: null,
      }).success,
    ).toBe(false);
  });
});

describe('embaucheSchema', () => {
  const base = {
    candidatureId: UUID,
    dateEntree: '2026-11-02',
    typeContrat: 'cdi',
    societeInterim: null,
  };

  it('accepte une embauche en CDI', () => {
    expect(embaucheSchema.safeParse(base).success).toBe(true);
  });

  it('date d’entrée obligatoire', () => {
    expect(embaucheSchema.safeParse({ ...base, dateEntree: '' }).success).toBe(false);
  });

  it('intérim : société d’intérim obligatoire', () => {
    const r = embaucheSchema.safeParse({ ...base, typeContrat: 'interim' });
    expect(r.success).toBe(false);
    expect(erreurs(r, 'societeInterim')[0]).toMatch(/intérim/);
    expect(
      embaucheSchema.safeParse({ ...base, typeContrat: 'interim', societeInterim: 'Adecco BTP' })
        .success,
    ).toBe(true);
  });
});
