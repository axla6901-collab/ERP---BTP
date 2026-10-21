import { describe, expect, it } from 'vitest';

import type { HoraireSemaine } from '@/lib/test-sirh/calendrier';
import {
  amplitudeMinutes,
  badgeagesSeChevauchent,
  construireFeuilleTemps,
  estLundi,
  formatEcartMinutes,
  fractionAbsenceJour,
  joursDeLaSemaine,
  libelleSemaine,
  minutesBadgeage,
  numeroSemaineIso,
  semaineDepuisParametre,
  totauxFeuille,
  trouverChevauchement,
  type AbsenceSource,
  type BadgeageSource,
  type EmployeFeuille,
} from '@/lib/test-sirh/temps/feuille-temps';

// Horaire 35 h : index 0 = dimanche (convention `jourSemaine`).
const H35: HoraireSemaine = [0, 7, 7, 7, 7, 7, 0];
const LUNDI = '2026-10-19';

function badgeage(partiel: Partial<BadgeageSource> & Pick<BadgeageSource, 'id'>): BadgeageSource {
  return {
    employeId: 'e1',
    dateBadgeage: LUNDI,
    heureDebut: '08:00:00',
    heureFin: '12:00:00',
    pauseMinutes: 0,
    lieu: 'chantier',
    chantierId: null,
    chantierLabel: null,
    source: 'manuel',
    valide: false,
    commentaire: null,
    ...partiel,
  };
}

describe('semaines', () => {
  it('reconnaît un lundi et calcule la semaine demandée', () => {
    expect(estLundi(LUNDI)).toBe(true);
    expect(estLundi('2026-10-20')).toBe(false);
    expect(estLundi('n’importe quoi')).toBe(false);
    expect(semaineDepuisParametre('2026-10-22', '2026-01-01')).toBe(LUNDI);
    expect(semaineDepuisParametre(undefined, '2026-10-21')).toBe(LUNDI);
    expect(semaineDepuisParametre('2026-02-30', '2026-10-25')).toBe(LUNDI);
    expect(joursDeLaSemaine(LUNDI)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('calcule le numéro de semaine ISO 8601', () => {
    expect(numeroSemaineIso(LUNDI)).toBe(43);
    expect(numeroSemaineIso('2026-01-01')).toBe(1);
    expect(numeroSemaineIso('2025-12-29')).toBe(1);
    expect(numeroSemaineIso('2027-01-01')).toBe(53);
    expect(libelleSemaine(LUNDI)).toBe('Semaine 43 · du 19/10/2026 au 25/10/2026');
  });
});

describe('badgeages', () => {
  it('calcule les minutes travaillées et l’amplitude (poste de nuit compris)', () => {
    expect(minutesBadgeage({ heureDebut: '07:30', heureFin: '16:00', pauseMinutes: 60 })).toBe(450);
    expect(minutesBadgeage({ heureDebut: '22:00', heureFin: '06:00', pauseMinutes: 30 })).toBe(450);
    expect(minutesBadgeage({ heureDebut: '08:00', heureFin: null, pauseMinutes: 0 })).toBeNull();
    expect(amplitudeMinutes('22:00', '06:00')).toBe(480);
  });

  it('détecte les chevauchements d’un même jour', () => {
    const matin = { heureDebut: '08:00', heureFin: '12:00' };
    expect(badgeagesSeChevauchent(matin, { heureDebut: '11:00', heureFin: '13:00' })).toBe(true);
    expect(badgeagesSeChevauchent(matin, { heureDebut: '12:00', heureFin: '13:00' })).toBe(false);
    expect(
      badgeagesSeChevauchent(
        { heureDebut: '22:00', heureFin: '06:00' },
        { heureDebut: '23:00', heureFin: '23:30' },
      ),
    ).toBe(true);
    // Un badgeage en cours court jusqu'à la fin de journée.
    expect(
      badgeagesSeChevauchent(
        { heureDebut: '08:00', heureFin: null },
        { heureDebut: '14:00', heureFin: '16:00' },
      ),
    ).toBe(true);
    expect(
      badgeagesSeChevauchent(
        { heureDebut: '17:00', heureFin: null },
        { heureDebut: '14:00', heureFin: '16:00' },
      ),
    ).toBe(false);
  });

  it('trouve le badgeage en conflit en ignorant celui qu’on modifie', () => {
    const existants = [
      { id: 'b1', heureDebut: '08:00:00', heureFin: '12:00:00' },
      { id: 'b2', heureDebut: '13:00:00', heureFin: '17:00:00' },
    ];
    expect(trouverChevauchement({ heureDebut: '11:30', heureFin: '13:30' }, existants)?.id).toBe(
      'b1',
    );
    expect(
      trouverChevauchement({ heureDebut: '08:00', heureFin: '11:00' }, existants, 'b1'),
    ).toBeNull();
    expect(trouverChevauchement({ heureDebut: '12:00', heureFin: '13:00' }, existants)).toBeNull();
  });
});

describe('absences', () => {
  const absence: AbsenceSource = {
    employeId: 'e1',
    dateDebut: '2026-10-21',
    dateFin: '2026-10-23',
    demiJourneeDebut: true,
    demiJourneeFin: true,
    libelle: 'Congés payés',
    code: 'CP',
    couleur: '#f59e0b',
  };

  it('donne la part de journée couverte', () => {
    expect(fractionAbsenceJour(absence, '2026-10-20')).toBe(0);
    expect(fractionAbsenceJour(absence, '2026-10-21')).toBe(0.5);
    expect(fractionAbsenceJour(absence, '2026-10-22')).toBe(1);
    expect(fractionAbsenceJour(absence, '2026-10-23')).toBe(0.5);
  });
});

describe('construireFeuilleTemps', () => {
  const employes: EmployeFeuille[] = [
    {
      id: 'e1',
      nom: 'Martin',
      prenom: 'Paul',
      matricule: 'M001',
      horaire: H35,
      horaireNom: '35 h',
      siteId: 's1',
    },
    {
      id: 'e2',
      nom: 'Durand',
      prenom: 'Léa',
      matricule: null,
      horaire: null,
      horaireNom: null,
      siteId: 's2',
    },
  ];

  const badgeages: BadgeageSource[] = [
    badgeage({ id: 'b1', heureDebut: '08:00:00', heureFin: '12:00:00', valide: true }),
    badgeage({ id: 'b2', heureDebut: '13:00:00', heureFin: '16:30:00', valide: true }),
    badgeage({
      id: 'b3',
      dateBadgeage: '2026-10-20',
      heureDebut: '07:30:00',
      heureFin: '16:00:00',
      pauseMinutes: 60,
    }),
    badgeage({ id: 'b4', dateBadgeage: '2026-10-21', heureDebut: '08:00:00', heureFin: null }),
    // Hors semaine et employé inconnu : ignorés.
    badgeage({ id: 'b5', dateBadgeage: '2026-10-26' }),
    badgeage({ id: 'b6', employeId: 'inconnu' }),
  ];

  const feuille = construireFeuilleTemps({
    lundi: '2026-10-21', // n'importe quel jour : ramené au lundi
    employes,
    badgeages,
    absences: [
      {
        employeId: 'e1',
        dateDebut: '2026-10-23',
        dateFin: '2026-10-23',
        demiJourneeDebut: true,
        demiJourneeFin: false,
        libelle: 'RTT',
        code: 'RTT',
        couleur: '#0ea5e9',
      },
    ],
    feries: [
      { date: '2026-10-22', libelle: 'Férié d’entreprise', siteId: null },
      { date: '2026-10-20', libelle: 'Fête locale', siteId: 's2' },
    ],
  });

  it('cadre la semaine du lundi au dimanche', () => {
    expect(feuille.lundi).toBe(LUNDI);
    expect(feuille.dimanche).toBe('2026-10-25');
    expect(feuille.jours).toHaveLength(7);
    expect(feuille.lignes.map((l) => l.employe.id)).toEqual(['e1', 'e2']);
  });

  it('agrège les badgeages par jour (tri par heure) et signale les badgeages en cours', () => {
    const e1 = feuille.lignes[0]!;
    const lundi = e1.jours[0]!;
    expect(lundi.badgeages.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(lundi.minutesTravaillees).toBe(450);
    expect(lundi.minutesTheoriques).toBe(420);
    expect(lundi.ecartMinutes).toBe(30);
    expect(e1.jours[1]!.minutesTravaillees).toBe(450);
    const mercredi = e1.jours[2]!;
    expect(mercredi.enCours).toBe(true);
    expect(mercredi.badgeages[0]).toMatchObject({ id: 'b4', minutes: null, enCours: true });
    expect(mercredi.minutesTravaillees).toBe(0);
  });

  it('neutralise les fériés chômés et proratise les absences dans le théorique', () => {
    const e1 = feuille.lignes[0]!;
    expect(e1.jours[3]).toMatchObject({ ferie: 'Férié d’entreprise', minutesTheoriques: 0 });
    expect(e1.jours[4]!.minutesTheoriques).toBe(210);
    expect(e1.jours[4]!.absences).toEqual([
      { libelle: 'RTT', code: 'RTT', couleur: '#0ea5e9', fraction: 0.5 },
    ]);
    // Le férié du site s2 ne concerne pas e1.
    expect(e1.jours[1]!.ferie).toBeNull();
    expect(feuille.lignes[1]!.jours[1]!.ferie).toBe('Fête locale');
  });

  it('totalise la semaine et l’état de validation par collaborateur', () => {
    const e1 = feuille.lignes[0]!;
    expect(e1.minutesTravaillees).toBe(900);
    expect(e1.minutesTheoriques).toBe(420 * 3 + 210);
    expect(e1.ecartMinutes).toBe(900 - 1470);
    expect(e1.nbBadgeages).toBe(4);
    expect(e1.nbEnCours).toBe(1);
    expect(e1.nbNonValides).toBe(1);
    expect(e1.semaineValidee).toBe(false);

    const e2 = feuille.lignes[1]!;
    expect(e2.minutesTheoriques).toBeNull();
    expect(e2.ecartMinutes).toBeNull();
    expect(e2.nbBadgeages).toBe(0);
    expect(e2.semaineValidee).toBe(false);
  });

  it('calcule les totaux de la feuille', () => {
    expect(feuille.totaux).toEqual({
      nbEmployes: 2,
      minutesTravaillees: 900,
      minutesTheoriques: 1470,
      ecartMinutes: -570,
      nbBadgeages: 4,
      nbNonValides: 1,
      nbEnCours: 1,
    });
    expect(totauxFeuille([]).nbEmployes).toBe(0);
  });

  it('considère la semaine validée quand tous les badgeages terminés le sont', () => {
    const f = construireFeuilleTemps({
      lundi: LUNDI,
      employes: [employes[0]!],
      badgeages: [badgeage({ id: 'x', valide: true })],
    });
    expect(f.lignes[0]!.semaineValidee).toBe(true);
  });
});

describe('formatEcartMinutes', () => {
  it('formate un écart signé', () => {
    expect(formatEcartMinutes(90)).toBe('+1 h 30');
    expect(formatEcartMinutes(120)).toBe('+2 h');
    expect(formatEcartMinutes(-45)).toBe('−0 h 45');
    expect(formatEcartMinutes(0)).toBe('0 h');
    expect(formatEcartMinutes(null)).toBe('—');
  });
});
