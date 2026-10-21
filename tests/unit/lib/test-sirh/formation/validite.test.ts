import { describe, expect, it } from 'vitest';

import {
  agregerFormationAnnee,
  calculerCloture,
  compterOccupants,
  coutSession,
  dateValiditeInscription,
  dateValiditeQualification,
  dernieresQualifications,
  heuresParticipant,
  joursAvantExpiration,
  libelleValidite,
  placesRestantes,
  statutQualification,
  tauxRemplissage,
  verifierCapacite,
  type SessionPourAgregat,
} from '@/lib/test-sirh/formation/validite';

const TODAY = '2026-10-19';

describe('validité des qualifications', () => {
  it('date de fin de session + validité en mois (jour borné)', () => {
    expect(dateValiditeQualification('2024-03-15', 24)).toBe('2026-03-15');
    expect(dateValiditeQualification('2024-01-31', 1)).toBe('2024-02-29');
    expect(dateValiditeQualification('2024-03-15', null)).toBeNull();
    expect(dateValiditeQualification('2024-03-15', 0)).toBeNull();
  });

  it('seule une inscription réussie porte une date de validité', () => {
    expect(dateValiditeInscription('reussi', '2026-06-30', 60)).toBe('2031-06-30');
    expect(dateValiditeInscription('echoue', '2026-06-30', 60)).toBeNull();
    expect(dateValiditeInscription('non_evalue', '2026-06-30', 60)).toBeNull();
  });

  it('statut : expirée / à recycler (≤ 90 j) / valide', () => {
    expect(statutQualification('2026-10-18', TODAY)).toBe('expiree');
    expect(statutQualification(TODAY, TODAY)).toBe('a_recycler');
    expect(statutQualification('2027-01-17', TODAY)).toBe('a_recycler');
    expect(statutQualification('2027-01-18', TODAY)).toBe('valide');
    expect(statutQualification(null, TODAY)).toBe('valide');
  });

  it('jours avant expiration et libellé de validité', () => {
    expect(joursAvantExpiration('2026-10-29', TODAY)).toBe(10);
    expect(joursAvantExpiration('2026-10-09', TODAY)).toBe(-10);
    expect(joursAvantExpiration(null, TODAY)).toBeNull();
    expect(libelleValidite(24)).toBe('2 ans');
    expect(libelleValidite(12)).toBe('1 an');
    expect(libelleValidite(18)).toBe('18 mois');
    expect(libelleValidite(null)).toBe('Sans échéance');
  });
});

describe('remplissage', () => {
  it('les annulations libèrent leur place', () => {
    expect(compterOccupants(['inscrit', 'present', 'absent', 'annule'])).toBe(3);
  });

  it('places restantes et taux de remplissage', () => {
    expect(placesRestantes(10, 7)).toBe(3);
    expect(placesRestantes(5, 7)).toBe(0);
    expect(placesRestantes(null, 7)).toBeNull();
    expect(tauxRemplissage(8, 6)).toBe(75);
    expect(tauxRemplissage(null, 6)).toBeNull();
  });

  it('refuse un ajout au-delà de la jauge', () => {
    expect(verifierCapacite(10, 8, 2)).toEqual({ ok: true });
    expect(verifierCapacite(10, 8, 3)).toEqual({ ok: false, restantes: 2 });
    expect(verifierCapacite(null, 500, 50)).toEqual({ ok: true });
  });
});

describe('heures et coûts', () => {
  const base: SessionPourAgregat = {
    dateDebut: '2026-03-02',
    statut: 'realisee',
    coutHt: null,
    formationCoutHt: '450.00',
    formationDureeHeures: '14.00',
    inscriptions: [
      { statut: 'present', heuresRealisees: null },
      { statut: 'present', heuresRealisees: '7.00' },
      { statut: 'absent', heuresRealisees: null },
      { statut: 'annule', heuresRealisees: null },
    ],
  };

  it('heures d’un présent : réalisées, sinon durée catalogue', () => {
    expect(heuresParticipant('3.5', '14')).toBe(3.5);
    expect(heuresParticipant(null, '14')).toBe(14);
    expect(heuresParticipant(null, null)).toBe(0);
  });

  it('coût : saisi, sinon catalogue × participants non annulés, 0 si annulée', () => {
    expect(coutSession(base)).toBe(1350);
    expect(coutSession({ ...base, coutHt: '2100.50' })).toBe(2100.5);
    expect(coutSession({ ...base, statut: 'annulee' })).toBe(0);
    expect(coutSession({ ...base, formationCoutHt: null })).toBe(0);
  });

  it('agrège l’année : présents seulement, sessions annulées et autres années exclues', () => {
    const autres: SessionPourAgregat[] = [
      { ...base, dateDebut: '2025-12-15' },
      { ...base, statut: 'annulee' },
      {
        ...base,
        dateDebut: '2026-09-10',
        coutHt: '800',
        inscriptions: [{ statut: 'present', heuresRealisees: '7' }],
      },
    ];
    expect(agregerFormationAnnee([base, ...autres], 2026)).toEqual({
      heures: 28,
      cout: 2150,
      nbSessions: 2,
      nbParticipants: 3,
    });
  });
});

describe('dernieresQualifications', () => {
  it('garde la dernière réussite par salarié et formation', () => {
    const r = dernieresQualifications([
      {
        employeId: 'e1',
        formationId: 'f1',
        dateFinSession: '2021-05-10',
        dateValidite: '2023-05-10',
      },
      {
        employeId: 'e1',
        formationId: 'f1',
        dateFinSession: '2023-05-02',
        dateValidite: '2025-05-02',
      },
      { employeId: 'e1', formationId: 'f2', dateFinSession: '2020-01-10', dateValidite: null },
      {
        employeId: 'e2',
        formationId: 'f1',
        dateFinSession: '2022-02-01',
        dateValidite: '2024-02-01',
      },
    ]);
    expect(r).toHaveLength(3);
    expect(r.find((q) => q.employeId === 'e1' && q.formationId === 'f1')?.dateFinSession).toBe(
      '2023-05-02',
    );
  });

  it('à date égale, préfère la validité la plus longue (sans échéance en tête)', () => {
    const r = dernieresQualifications([
      {
        employeId: 'e1',
        formationId: 'f1',
        dateFinSession: '2024-01-01',
        dateValidite: '2026-01-01',
      },
      { employeId: 'e1', formationId: 'f1', dateFinSession: '2024-01-01', dateValidite: null },
    ]);
    expect(r[0]?.dateValidite).toBeNull();
  });
});

describe('calculerCloture', () => {
  it('passe les inscrits présents, réussit les non évalués et complète les heures', () => {
    const majs = calculerCloture(
      [
        { id: 'i1', statut: 'inscrit', resultat: 'non_evalue', heuresRealisees: null },
        { id: 'i2', statut: 'present', resultat: 'echoue', heuresRealisees: '7.00' },
        { id: 'i3', statut: 'absent', resultat: 'non_evalue', heuresRealisees: null },
        { id: 'i4', statut: 'annule', resultat: 'non_evalue', heuresRealisees: null },
        { id: 'i5', statut: 'present', resultat: 'reussi', heuresRealisees: '14.00' },
      ],
      { dateFin: '2026-10-16', validiteMois: 24, dureeHeures: '14' },
    );
    expect(majs).toEqual([
      {
        id: 'i1',
        statut: 'present',
        resultat: 'reussi',
        heuresRealisees: '14.00',
        dateValidite: '2028-10-16',
      },
    ]);
  });

  it('sans validité ni durée catalogue : qualification permanente, heures inchangées', () => {
    const majs = calculerCloture(
      [{ id: 'i1', statut: 'present', resultat: 'non_evalue', heuresRealisees: null }],
      { dateFin: '2026-10-16', validiteMois: null, dureeHeures: null },
    );
    expect(majs).toEqual([
      {
        id: 'i1',
        statut: 'present',
        resultat: 'reussi',
        heuresRealisees: null,
        dateValidite: null,
      },
    ]);
  });
});
