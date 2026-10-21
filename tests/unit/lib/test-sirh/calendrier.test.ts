import { describe, expect, it } from 'vitest';

import {
  ajouterJours,
  ajouterMois,
  chevauchement,
  compterJoursAbsence,
  differenceJours,
  dimanchePaques,
  dureeTravailMinutes,
  enumererJours,
  estDateIso,
  heuresHebdo,
  heuresTheoriquesJour,
  horaireDepuisLigne,
  jourSemaine,
  joursFeriesFrance,
  lundiDeLaSemaine,
  minutesDepuisMinuit,
  periodeReference,
  premierJourDuMois,
  dernierJourDuMois,
} from '@/lib/test-sirh/calendrier';

describe('dates ISO', () => {
  it('valide le format et la date calendaire', () => {
    expect(estDateIso('2026-02-28')).toBe(true);
    expect(estDateIso('2026-02-30')).toBe(false);
    expect(estDateIso('2026-2-3')).toBe(false);
    expect(estDateIso(null)).toBe(false);
  });

  it('ajoute des jours en franchissant les mois et années', () => {
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('ajoute des mois en bornant au dernier jour du mois cible', () => {
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28');
    expect(ajouterMois('2028-01-31', 1)).toBe('2028-02-29');
    expect(ajouterMois('2026-06-15', 24)).toBe('2028-06-15');
  });

  it('jour de semaine (0 = dimanche) et lundi de la semaine', () => {
    expect(jourSemaine('2026-10-19')).toBe(1); // lundi
    expect(jourSemaine('2026-10-18')).toBe(0); // dimanche
    expect(lundiDeLaSemaine('2026-10-18')).toBe('2026-10-12');
    expect(lundiDeLaSemaine('2026-10-21')).toBe('2026-10-19');
  });

  it('différence, énumération, bornes de mois et chevauchement', () => {
    expect(differenceJours('2026-01-01', '2026-01-31')).toBe(30);
    expect(enumererJours('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
    expect(enumererJours('2026-02-02', '2026-01-30')).toEqual([]);
    expect(premierJourDuMois(2026, 2)).toBe('2026-02-01');
    expect(dernierJourDuMois(2026, 2)).toBe('2026-02-28');
    expect(chevauchement('2026-01-01', '2026-01-10', '2026-01-10', '2026-01-20')).toBe(true);
    expect(chevauchement('2026-01-01', '2026-01-09', '2026-01-10', '2026-01-20')).toBe(false);
  });
});

describe('jours fériés', () => {
  it('calcule le dimanche de Pâques', () => {
    expect(dimanchePaques(2024)).toBe('2024-03-31');
    expect(dimanchePaques(2025)).toBe('2025-04-20');
    expect(dimanchePaques(2026)).toBe('2026-04-05');
    expect(dimanchePaques(2027)).toBe('2027-03-28');
  });

  it('liste les 11 fériés légaux 2026, triés', () => {
    const f = joursFeriesFrance(2026);
    expect(f).toHaveLength(11);
    expect(f.map((x) => x.date)).toEqual([
      '2026-01-01',
      '2026-04-06',
      '2026-05-01',
      '2026-05-08',
      '2026-05-14',
      '2026-05-25',
      '2026-07-14',
      '2026-08-15',
      '2026-11-01',
      '2026-11-11',
      '2026-12-25',
    ]);
  });

  it('ajoute Vendredi saint et Saint-Étienne en Alsace-Moselle', () => {
    const f = joursFeriesFrance(2026, { alsaceMoselle: true });
    expect(f).toHaveLength(13);
    expect(f.find((x) => x.libelle === 'Vendredi saint')?.date).toBe('2026-04-03');
    expect(f.find((x) => x.libelle === 'Saint-Étienne')?.date).toBe('2026-12-26');
  });
});

describe('compterJoursAbsence', () => {
  const feries2026 = joursFeriesFrance(2026).map((f) => f.date);

  it('jours ouvrés : une semaine du lundi au vendredi = 5', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-19',
        dateFin: '2026-10-23',
        unite: 'jours_ouvres',
      }),
    ).toBe(5);
  });

  it('jours ouvrables : lundi→vendredi = 6 (samedi final décompté)', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-19',
        dateFin: '2026-10-23',
        unite: 'jours_ouvrables',
      }),
    ).toBe(6);
  });

  it('jours ouvrables sans règle du samedi final = 5', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-19',
        dateFin: '2026-10-23',
        unite: 'jours_ouvrables',
        samediFinal: false,
      }),
    ).toBe(5);
  });

  it('exclut les jours fériés des ouvrés (semaine de l’Ascension 2026)', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-05-11',
        dateFin: '2026-05-15',
        unite: 'jours_ouvres',
        feries: feries2026,
      }),
    ).toBe(4);
  });

  it('jours calendaires : tout compte, fériés et week-ends inclus', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-05-01',
        dateFin: '2026-05-10',
        unite: 'jours_calendaires',
        feries: feries2026,
      }),
    ).toBe(10);
  });

  it('gère les demi-journées de début et de fin', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-19',
        dateFin: '2026-10-21',
        demiJourneeDebut: true,
        demiJourneeFin: true,
        unite: 'jours_ouvres',
      }),
    ).toBe(2);
  });

  it('jour unique : demi-journée = 0,5', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-20',
        dateFin: '2026-10-20',
        demiJourneeDebut: true,
        unite: 'jours_ouvres',
      }),
    ).toBe(0.5);
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-20',
        dateFin: '2026-10-20',
        demiJourneeFin: true,
        unite: 'jours_ouvres',
      }),
    ).toBe(0.5);
  });

  it('vendredi midi en ouvrables : pas de samedi final', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-23',
        dateFin: '2026-10-23',
        demiJourneeFin: true,
        unite: 'jours_ouvrables',
      }),
    ).toBe(0.5);
  });

  it('période inversée ou week-end seul = 0', () => {
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-23',
        dateFin: '2026-10-19',
        unite: 'jours_ouvres',
      }),
    ).toBe(0);
    expect(
      compterJoursAbsence({
        dateDebut: '2026-10-24',
        dateFin: '2026-10-25',
        unite: 'jours_ouvres',
      }),
    ).toBe(0);
  });
});

describe('periodeReference', () => {
  it('BTP (avril → mars) par défaut', () => {
    expect(periodeReference('2026-10-19')).toEqual({ debut: '2026-04-01', fin: '2027-03-31' });
    expect(periodeReference('2026-02-10')).toEqual({ debut: '2025-04-01', fin: '2026-03-31' });
  });

  it('régime général (juin → mai)', () => {
    expect(periodeReference('2026-05-31', 6)).toEqual({ debut: '2025-06-01', fin: '2026-05-31' });
    expect(periodeReference('2026-06-01', 6)).toEqual({ debut: '2026-06-01', fin: '2027-05-31' });
  });
});

describe('temps de travail', () => {
  it('convertit les heures en minutes depuis minuit', () => {
    expect(minutesDepuisMinuit('07:30')).toBe(450);
    expect(minutesDepuisMinuit('17:45:00')).toBe(1065);
    expect(minutesDepuisMinuit('25:00')).toBeNull();
    expect(minutesDepuisMinuit(null)).toBeNull();
  });

  it('durée de badgeage avec pause, poste de nuit et badgeage en cours', () => {
    expect(dureeTravailMinutes('07:30', '17:00', 60)).toBe(510);
    expect(dureeTravailMinutes('22:00', '06:00', 30)).toBe(450);
    expect(dureeTravailMinutes('08:00', null)).toBeNull();
    expect(dureeTravailMinutes('08:00', '08:30', 60)).toBe(0);
  });

  it('horaire hebdomadaire : total et heures théoriques du jour', () => {
    const h = horaireDepuisLigne({
      heuresLundi: '8',
      heuresMardi: '8',
      heuresMercredi: '8',
      heuresJeudi: '8',
      heuresVendredi: '7',
      heuresSamedi: '0',
      heuresDimanche: '0',
    });
    expect(heuresHebdo(h)).toBe(39);
    expect(heuresTheoriquesJour(h, '2026-10-23')).toBe(7); // vendredi
    expect(heuresTheoriquesJour(h, '2026-10-24')).toBe(0); // samedi
    expect(heuresTheoriquesJour(h, '2026-11-11', new Set(['2026-11-11']))).toBe(0);
  });
});
