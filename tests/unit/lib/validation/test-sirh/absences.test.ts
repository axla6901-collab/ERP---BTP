import { describe, expect, it } from 'vitest';

import {
  ajustementSchema,
  compteurSchema,
  demandeAbsenceSchema,
  generationFeriesSchema,
  idAbsenceSchema,
  initialisationCompteursSchema,
  jourFerieSchema,
  periodeBloqueeSchema,
  typeAbsenceSchema,
} from '@/lib/validation/test-sirh/absences';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID_2 = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';

function cheminsEnErreur(r: {
  success: boolean;
  error?: { issues: Array<{ path: PropertyKey[] }> };
}) {
  return (r.error?.issues ?? []).map((i) => i.path.join('.'));
}

describe('typeAbsenceSchema', () => {
  const valide = {
    code: 'cp',
    libelle: 'Congés payés',
    categorie: 'conges',
    uniteDecompte: 'jours_ouvrables',
    avecSolde: true,
    necessiteValidation: true,
    justificatifRequis: false,
    remuneree: true,
    couleur: '#f59e0b',
    codeRubriquePaie: '',
    actif: true,
    ordre: '10',
  };

  it('normalise le code en majuscules, l’ordre en entier, la rubrique vide en null', () => {
    const r = typeAbsenceSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ code: 'CP', ordre: 10, codeRubriquePaie: null });
  });

  it('refuse un code avec espace, une couleur invalide, une unité inconnue', () => {
    expect(typeAbsenceSchema.safeParse({ ...valide, code: 'C P' }).success).toBe(false);
    expect(typeAbsenceSchema.safeParse({ ...valide, couleur: 'orange' }).success).toBe(false);
    expect(typeAbsenceSchema.safeParse({ ...valide, uniteDecompte: 'semaines' }).success).toBe(
      false,
    );
    expect(typeAbsenceSchema.safeParse({ ...valide, ordre: '-1' }).success).toBe(false);
  });
});

describe('demandeAbsenceSchema', () => {
  const valide = {
    employeId: UUID,
    typeAbsenceId: UUID_2,
    dateDebut: '2026-10-12',
    dateFin: '2026-10-16',
    demiJourneeDebut: false,
    demiJourneeFin: false,
    dureeHeures: '',
    motif: '  ',
    justificatifDocumentId: '',
    approuverDirectement: false,
  };

  it('accepte une demande complète (champs optionnels vides → null)', () => {
    const r = demandeAbsenceSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ dureeHeures: null, motif: null, justificatifDocumentId: null });
  });

  it('refuse une fin avant le début (erreur sur dateFin)', () => {
    const r = demandeAbsenceSchema.safeParse({ ...valide, dateFin: '2026-10-11' });
    expect(r.success).toBe(false);
    expect(cheminsEnErreur(r)).toContain('dateFin');
  });

  it('refuse matin ET après-midi exclus sur une seule journée', () => {
    const r = demandeAbsenceSchema.safeParse({
      ...valide,
      dateFin: '2026-10-12',
      demiJourneeDebut: true,
      demiJourneeFin: true,
    });
    expect(r.success).toBe(false);
    expect(cheminsEnErreur(r)).toContain('demiJourneeFin');
  });

  it('refuse une date inexistante et normalise la durée en heures', () => {
    expect(demandeAbsenceSchema.safeParse({ ...valide, dateDebut: '2026-02-30' }).success).toBe(
      false,
    );
    expect(
      demandeAbsenceSchema.safeParse({ ...valide, dureeHeures: '7,5' }).data?.dureeHeures,
    ).toBe('7.50');
    expect(demandeAbsenceSchema.safeParse({ ...valide, dureeHeures: '0' }).success).toBe(false);
  });

  it('identifiant d’absence (annulation)', () => {
    expect(idAbsenceSchema.safeParse(UUID).success).toBe(true);
    expect(idAbsenceSchema.safeParse('x').success).toBe(false);
  });
});

describe('compteurs et ajustements', () => {
  const compteur = {
    employeId: UUID,
    typeAbsenceId: UUID_2,
    periodeDebut: '2026-04-01',
    periodeFin: '2027-03-31',
    droitsAcquis: '30',
    report: '-2,5',
    notes: null,
  };

  it('compteur : droits ≥ 0, report signé, période ordonnée', () => {
    expect(compteurSchema.safeParse(compteur).data).toMatchObject({
      droitsAcquis: '30.00',
      report: '-2.50',
    });
    expect(compteurSchema.safeParse({ ...compteur, droitsAcquis: '-1' }).success).toBe(false);
    const inverse = compteurSchema.safeParse({ ...compteur, periodeFin: '2026-03-31' });
    expect(cheminsEnErreur(inverse)).toContain('periodeFin');
  });

  it('ajustement : valeur signée non nulle, motif requis', () => {
    const base = {
      compteurId: UUID,
      dateAjustement: '2026-10-19',
      valeur: '-2,5',
      motif: 'Régularisation',
    };
    expect(ajustementSchema.safeParse(base).data?.valeur).toBe('-2.50');
    expect(ajustementSchema.safeParse({ ...base, valeur: '0' }).success).toBe(false);
    expect(ajustementSchema.safeParse({ ...base, motif: '' }).success).toBe(false);
  });

  it('initialisation groupée', () => {
    const base = {
      typeAbsenceId: UUID_2,
      periodeDebut: '2026-04-01',
      periodeFin: '2027-03-31',
      droitsAcquis: 30,
    };
    expect(initialisationCompteursSchema.safeParse(base).data?.droitsAcquis).toBe('30.00');
    expect(
      initialisationCompteursSchema.safeParse({ ...base, periodeFin: '2026-01-01' }).success,
    ).toBe(false);
  });
});

describe('jours fériés et périodes bloquées', () => {
  it('jour férié global (site vide → null) ou de site', () => {
    const r = jourFerieSchema.safeParse({
      dateFerie: '2026-12-26',
      libelle: 'Saint-Étienne',
      siteId: '',
      chome: true,
    });
    expect(r.data?.siteId).toBeNull();
    expect(
      jourFerieSchema.safeParse({ dateFerie: '2026-12-26', libelle: '', siteId: UUID, chome: true })
        .success,
    ).toBe(false);
  });

  it('génération d’une année (2000–2100)', () => {
    expect(
      generationFeriesSchema.safeParse({ annee: '2027', alsaceMoselle: true, siteId: null }).data,
    ).toEqual({ annee: 2027, alsaceMoselle: true, siteId: null });
    expect(
      generationFeriesSchema.safeParse({ annee: 1999, alsaceMoselle: false, siteId: null }).success,
    ).toBe(false);
  });

  it('période bloquée : type et équipe optionnels, dates ordonnées', () => {
    const base = {
      libelle: 'Fermeture estivale',
      dateDebut: '2026-08-03',
      dateFin: '2026-08-21',
      typeAbsenceId: '',
      equipeId: UUID,
      motif: null,
    };
    expect(periodeBloqueeSchema.safeParse(base).data).toMatchObject({
      typeAbsenceId: null,
      equipeId: UUID,
    });
    expect(
      cheminsEnErreur(periodeBloqueeSchema.safeParse({ ...base, dateFin: '2026-08-01' })),
    ).toContain('dateFin');
  });
});
