import { describe, expect, it } from 'vitest';

import {
  calculerSolde,
  droitsParDefaut,
  dureeDansPeriode,
  formatDuree,
  messageSoldeInsuffisant,
  trouverCompteurApplicable,
} from '@/lib/test-sirh/absences/soldes';

// Période de référence BTP (avril → mars).
const PERIODE_2026 = { debut: '2026-04-01', fin: '2027-03-31' };
const PERIODE_2027 = { debut: '2027-04-01', fin: '2028-03-31' };

describe('calculerSolde', () => {
  it('solde = droits + report + Σ ajustements − pris ; prévisionnel − en attente', () => {
    expect(
      calculerSolde({
        droitsAcquis: '30.00',
        report: '2.50',
        ajustements: ['1.00', '-0.50'],
        pris: 10,
        enAttente: 3,
      }),
    ).toEqual({
      droitsAcquis: 30,
      report: 2.5,
      totalAjustements: 0.5,
      pris: 10,
      enAttente: 3,
      solde: 23,
      soldePrevisionnel: 20,
    });
  });

  it('arrondit au centième et tolère un compteur vide', () => {
    const s = calculerSolde({ droitsAcquis: 0, report: 0, ajustements: [0.1, 0.2], pris: 0 });
    expect(s.totalAjustements).toBe(0.3);
    expect(s.solde).toBe(0.3);
    expect(s.enAttente).toBe(0);
    expect(s.soldePrevisionnel).toBe(0.3);
  });

  it('solde négatif possible (droits dépassés)', () => {
    expect(calculerSolde({ droitsAcquis: '2', report: '0', ajustements: [], pris: 5 }).solde).toBe(
      -3,
    );
  });
});

describe('dureeDansPeriode', () => {
  const absence = (dateDebut: string, dateFin: string, duree: number, demi = false) => ({
    dateDebut,
    dateFin,
    demiJourneeDebut: demi,
    demiJourneeFin: false,
    duree,
  });

  it('absence incluse : durée enregistrée ; hors période : 0', () => {
    expect(
      dureeDansPeriode(absence('2026-10-12', '2026-10-16', 6), PERIODE_2026, 'jours_ouvrables'),
    ).toBe(6);
    expect(
      dureeDansPeriode(absence('2026-10-12', '2026-10-16', 6), PERIODE_2027, 'jours_ouvrables'),
    ).toBe(0);
  });

  it('absence à cheval : ventilation jour par jour (jours ouvrés)', () => {
    // Mardi 30/03/2027 → vendredi 02/04/2027 = 4 jours ouvrés.
    const a = absence('2027-03-30', '2027-04-02', 4);
    expect(dureeDansPeriode(a, PERIODE_2026, 'jours_ouvres')).toBe(2);
    expect(dureeDansPeriode(a, PERIODE_2027, 'jours_ouvres')).toBe(2);
  });

  it('jours ouvrables : le samedi final ne compte qu’à la fin réelle de l’absence', () => {
    // 4 jours + samedi 03/04/2027 = 5 jours ouvrables au total.
    const a = absence('2027-03-30', '2027-04-02', 5);
    expect(dureeDansPeriode(a, PERIODE_2026, 'jours_ouvrables')).toBe(2);
    expect(dureeDansPeriode(a, PERIODE_2027, 'jours_ouvrables')).toBe(3);
  });

  it('demi-journée de début conservée à la borne d’origine', () => {
    // Mercredi 31/03/2027 après-midi → jeudi 01/04/2027.
    const a = absence('2027-03-31', '2027-04-01', 1.5, true);
    expect(dureeDansPeriode(a, PERIODE_2026, 'jours_ouvres')).toBe(0.5);
    expect(dureeDansPeriode(a, PERIODE_2027, 'jours_ouvres')).toBe(1);
  });

  it('fériés exclus de la partie recalculée', () => {
    // Lundi de Pâques 2027 = 29/03 : absence du lundi 29/03 au vendredi 02/04, à cheval.
    const a = absence('2027-03-29', '2027-04-02', 4);
    expect(dureeDansPeriode(a, PERIODE_2026, 'jours_ouvres', ['2027-03-29'])).toBe(2);
  });

  it('unité heures : rattachée en totalité à la période de la date de début', () => {
    const a = absence('2027-03-31', '2027-04-01', 14);
    expect(dureeDansPeriode(a, PERIODE_2026, 'heures')).toBe(14);
    expect(dureeDansPeriode(a, PERIODE_2027, 'heures')).toBe(0);
  });
});

describe('compteur applicable, messages et défauts', () => {
  const compteurs = [
    {
      id: 'c2026',
      employeId: 'e1',
      typeAbsenceId: 'cp',
      periodeDebut: '2026-04-01',
      periodeFin: '2027-03-31',
    },
    {
      id: 'c2027',
      employeId: 'e1',
      typeAbsenceId: 'cp',
      periodeDebut: '2027-04-01',
      periodeFin: '2028-03-31',
    },
    {
      id: 'autre',
      employeId: 'e2',
      typeAbsenceId: 'cp',
      periodeDebut: '2026-04-01',
      periodeFin: '2027-03-31',
    },
  ];

  it('trouve le compteur dont la période contient la date', () => {
    expect(
      trouverCompteurApplicable(compteurs, {
        employeId: 'e1',
        typeAbsenceId: 'cp',
        date: '2026-10-19',
      })?.id,
    ).toBe('c2026');
    expect(
      trouverCompteurApplicable(compteurs, {
        employeId: 'e1',
        typeAbsenceId: 'cp',
        date: '2027-04-01',
      })?.id,
    ).toBe('c2027');
    expect(
      trouverCompteurApplicable(compteurs, {
        employeId: 'e1',
        typeAbsenceId: 'rtt',
        date: '2026-10-19',
      }),
    ).toBeNull();
  });

  it('avertissement de solde insuffisant (non bloquant)', () => {
    expect(messageSoldeInsuffisant(5, 5, 'jours_ouvrables')).toBeNull();
    const msg = messageSoldeInsuffisant(5, 6, 'jours_ouvrables');
    expect(msg).toContain('Solde insuffisant');
    expect(msg).toContain('5 j');
    expect(msg).toContain('6 j');
    expect(messageSoldeInsuffisant(2, 3.5, 'heures')).toContain('3 h 30');
  });

  it('format de durée selon l’unité', () => {
    expect(formatDuree(2.5, 'jours_ouvres')).toBe('2,5 j');
    expect(formatDuree(7.5, 'heures')).toBe('7 h 30');
  });

  it('droits par défaut : CP = 30 j ouvrables / 25 j ouvrés, autres = 0', () => {
    expect(droitsParDefaut({ code: 'CP', uniteDecompte: 'jours_ouvrables' })).toBe(30);
    expect(droitsParDefaut({ code: 'cp', uniteDecompte: 'jours_ouvres' })).toBe(25);
    expect(droitsParDefaut({ code: 'CP', uniteDecompte: 'jours_calendaires' })).toBe(0);
    expect(droitsParDefaut({ code: 'RTT', uniteDecompte: 'jours_ouvres' })).toBe(0);
  });
});
