import { describe, expect, it } from 'vitest';

import { calculerKpiAbsences, type AbsenceKpi } from '@/lib/test-sirh/absences/kpi';

function absence(
  p: Partial<AbsenceKpi> & Pick<AbsenceKpi, 'employeId' | 'dateDebut' | 'dateFin'>,
): AbsenceKpi {
  return {
    demiJourneeDebut: false,
    demiJourneeFin: false,
    statut: 'approuvee',
    duree: 1,
    unite: 'jours_ouvres',
    categorie: 'conges',
    necessiteValidation: true,
    ...p,
  };
}

describe('calculerKpiAbsences', () => {
  const today = '2026-10-19'; // lundi

  const absences: AbsenceKpi[] = [
    // CP approuvé du 12 au 16/10 : 6 jours ouvrables posés ce mois.
    absence({
      employeId: 'e1',
      dateDebut: '2026-10-12',
      dateFin: '2026-10-16',
      duree: 6,
      unite: 'jours_ouvrables',
    }),
    // RTT de l'après-midi du 19/10 : absent aujourd'hui, 0,5 j posé.
    absence({
      employeId: 'e1',
      dateDebut: '2026-10-19',
      dateFin: '2026-10-19',
      demiJourneeDebut: true,
      duree: 0.5,
    }),
    // Arrêt maladie en cours : absent, arrêt, mais pas « posé ».
    absence({
      employeId: 'e2',
      dateDebut: '2026-10-15',
      dateFin: '2026-10-25',
      duree: 11,
      unite: 'jours_calendaires',
      categorie: 'maladie',
      necessiteValidation: false,
    }),
    // RTT à cheval sur septembre : seuls 1er et 2 octobre comptent (2 j).
    absence({ employeId: 'e3', dateDebut: '2026-09-28', dateFin: '2026-10-02', duree: 5 }),
    // Demande en attente couvrant aujourd'hui : ignorée.
    absence({
      employeId: 'e4',
      dateDebut: '2026-10-19',
      dateFin: '2026-10-20',
      duree: 2,
      statut: 'en_attente',
    }),
    // Intempéries en heures aujourd'hui : absent, mais exclu des jours posés.
    absence({
      employeId: 'e5',
      dateDebut: '2026-10-19',
      dateFin: '2026-10-19',
      duree: 7,
      unite: 'heures',
      categorie: 'intemperies',
      necessiteValidation: false,
    }),
  ];

  it('agrège en attente, absents du jour, jours posés du mois et arrêts en cours', () => {
    expect(calculerKpiAbsences({ absences, enAttente: 3, today })).toEqual({
      enAttente: 3,
      absentsAujourdhui: 3,
      joursPosesMois: 8.5,
      arretsMaladieEnCours: 1,
    });
  });

  it('applique les fériés de l’employé à la partie recalculée', () => {
    const kpi = calculerKpiAbsences({
      absences: [
        absence({ employeId: 'e3', dateDebut: '2026-09-28', dateFin: '2026-10-02', duree: 5 }),
      ],
      enAttente: 0,
      today,
      feriesEmploye: () => ['2026-10-02'],
    });
    expect(kpi.joursPosesMois).toBe(1);
  });

  it('valeurs nulles sans absence', () => {
    expect(calculerKpiAbsences({ absences: [], enAttente: 0, today })).toEqual({
      enAttente: 0,
      absentsAujourdhui: 0,
      joursPosesMois: 0,
      arretsMaladieEnCours: 0,
    });
  });
});
