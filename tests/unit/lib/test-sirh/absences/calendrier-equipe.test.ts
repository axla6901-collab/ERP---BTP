import { describe, expect, it } from 'vitest';

import {
  cleMois,
  compacterGrille,
  construireGrilleMois,
  decompacterCellules,
  moisVoisin,
  type AbsenceCalendrier,
  type TypeCalendrier,
} from '@/lib/test-sirh/absences/calendrier-equipe';

const TYPES: TypeCalendrier[] = [
  {
    id: 'cp',
    code: 'CP',
    libelle: 'Congés payés',
    couleur: '#f59e0b',
    uniteDecompte: 'jours_ouvrables',
  },
  { id: 'rtt', code: 'RTT', libelle: 'RTT', couleur: '#0ea5e9', uniteDecompte: 'jours_ouvres' },
  {
    id: 'mal',
    code: 'MAL',
    libelle: 'Arrêt maladie',
    couleur: '#ef4444',
    uniteDecompte: 'jours_calendaires',
  },
  { id: 'int', code: 'INT', libelle: 'Intempéries', couleur: '#64748b', uniteDecompte: 'heures' },
];

const EMPLOYES = [
  { id: 'e1', label: 'Marc Dubois', siteId: 'site-a' },
  { id: 'e2', label: 'Léa Martin', siteId: null },
];

const FERIES = [
  { date: '2026-10-14', libelle: 'Fête locale', siteId: 'site-a' },
  { date: '2026-10-15', libelle: 'Pont entreprise', siteId: null },
];

function absence(
  p: Partial<AbsenceCalendrier> &
    Pick<AbsenceCalendrier, 'id' | 'employeId' | 'typeAbsenceId' | 'dateDebut' | 'dateFin'>,
): AbsenceCalendrier {
  return { demiJourneeDebut: false, demiJourneeFin: false, statut: 'approuvee', ...p };
}

function grille(absences: AbsenceCalendrier[]) {
  return construireGrilleMois({
    annee: 2026,
    mois: 10,
    employes: EMPLOYES,
    absences,
    feries: FERIES,
    types: TYPES,
    today: '2026-10-19',
  });
}

function cellule(g: ReturnType<typeof grille>, employeId: string, date: string) {
  const ligne = g.lignes.find((l) => l.employe.id === employeId);
  const c = ligne?.cellules.find((x) => x.date === date);
  if (!c) throw new Error(`cellule ${employeId} ${date} absente`);
  return c;
}

describe('construireGrilleMois — en-têtes', () => {
  it('un jour par colonne avec initiale, week-end, férié global et aujourd’hui', () => {
    const g = grille([]);
    expect(g.jours).toHaveLength(31);
    expect(g.jours[0]).toEqual({
      date: '2026-10-01',
      numero: 1,
      initiale: 'J',
      weekEnd: false,
      ferie: null,
      aujourdhui: false,
    });
    expect(g.jours[2]?.weekEnd).toBe(true); // samedi 3
    expect(g.jours[13]?.ferie).toBeNull(); // férié de site : pas en en-tête
    expect(g.jours[14]?.ferie).toBe('Pont entreprise');
    expect(g.jours[18]).toMatchObject({ date: '2026-10-19', initiale: 'L', aujourdhui: true });
    expect(g.lignes.map((l) => l.employe.id)).toEqual(['e1', 'e2']);
  });

  it('fériés par employé : globaux + ceux de son site', () => {
    const g = grille([]);
    expect(cellule(g, 'e1', '2026-10-14').ferie).toBe('Fête locale');
    expect(cellule(g, 'e2', '2026-10-14').ferie).toBeNull();
    expect(cellule(g, 'e2', '2026-10-15').ferie).toBe('Pont entreprise');
  });
});

describe('construireGrilleMois — absences', () => {
  it('peint les jours décomptés : pas les fériés chômés de l’employé', () => {
    const g = grille([
      absence({
        id: 'a1',
        employeId: 'e1',
        typeAbsenceId: 'cp',
        dateDebut: '2026-10-12',
        dateFin: '2026-10-16',
      }),
    ]);
    const segment = { absenceId: 'a1', typeAbsenceId: 'cp', statut: 'approuvee' };
    expect(cellule(g, 'e1', '2026-10-12')).toMatchObject({ matin: segment, apresMidi: segment });
    expect(cellule(g, 'e1', '2026-10-14')).toMatchObject({ matin: null, apresMidi: null });
    expect(cellule(g, 'e1', '2026-10-15')).toMatchObject({ matin: null, apresMidi: null });
    expect(cellule(g, 'e1', '2026-10-16').matin).toEqual(segment);
    expect(cellule(g, 'e1', '2026-10-17').matin).toBeNull(); // hors de l'absence
  });

  it('jours calendaires : le week-end est couvert', () => {
    const g = grille([
      absence({
        id: 'm',
        employeId: 'e2',
        typeAbsenceId: 'mal',
        dateDebut: '2026-10-17',
        dateFin: '2026-10-18',
      }),
    ]);
    expect(cellule(g, 'e2', '2026-10-17').matin?.absenceId).toBe('m');
    expect(cellule(g, 'e2', '2026-10-18').apresMidi?.absenceId).toBe('m');
  });

  it('jours ouvrables : le samedi est couvert, pas le dimanche', () => {
    const g = grille([
      absence({
        id: 'c',
        employeId: 'e2',
        typeAbsenceId: 'cp',
        dateDebut: '2026-10-23',
        dateFin: '2026-10-26',
      }),
    ]);
    expect(cellule(g, 'e2', '2026-10-24').matin?.absenceId).toBe('c');
    expect(cellule(g, 'e2', '2026-10-25').matin).toBeNull();
    expect(cellule(g, 'e2', '2026-10-26').matin?.absenceId).toBe('c');
  });

  it('demi-journées : après-midi du premier jour, matin du dernier, statut en attente conservé', () => {
    const g = grille([
      absence({
        id: 'r',
        employeId: 'e2',
        typeAbsenceId: 'rtt',
        dateDebut: '2026-10-21',
        dateFin: '2026-10-22',
        demiJourneeDebut: true,
        demiJourneeFin: true,
        statut: 'en_attente',
      }),
    ]);
    expect(cellule(g, 'e2', '2026-10-21').matin).toBeNull();
    expect(cellule(g, 'e2', '2026-10-21').apresMidi).toEqual({
      absenceId: 'r',
      typeAbsenceId: 'rtt',
      statut: 'en_attente',
    });
    expect(cellule(g, 'e2', '2026-10-22').matin?.absenceId).toBe('r');
    expect(cellule(g, 'e2', '2026-10-22').apresMidi).toBeNull();
  });

  it('unité heures affichée comme des jours ouvrés (pas le samedi)', () => {
    const g = grille([
      absence({
        id: 'i',
        employeId: 'e1',
        typeAbsenceId: 'int',
        dateDebut: '2026-10-30',
        dateFin: '2026-10-31',
      }),
    ]);
    expect(cellule(g, 'e1', '2026-10-30').matin?.absenceId).toBe('i');
    expect(cellule(g, 'e1', '2026-10-31').matin).toBeNull();
  });

  it('l’absence approuvée l’emporte sur une demande en attente en conflit', () => {
    const g = grille([
      absence({
        id: 'attente',
        employeId: 'e2',
        typeAbsenceId: 'rtt',
        dateDebut: '2026-10-05',
        dateFin: '2026-10-05',
        statut: 'en_attente',
      }),
      absence({
        id: 'ok',
        employeId: 'e2',
        typeAbsenceId: 'cp',
        dateDebut: '2026-10-05',
        dateFin: '2026-10-05',
      }),
    ]);
    expect(cellule(g, 'e2', '2026-10-05').matin?.absenceId).toBe('ok');
  });

  it('compte les demi-journées affichées et borne au mois', () => {
    const g = grille([
      absence({
        id: 'a1',
        employeId: 'e1',
        typeAbsenceId: 'cp',
        dateDebut: '2026-09-28',
        dateFin: '2026-10-02',
      }),
      absence({
        id: 'a2',
        employeId: 'e1',
        typeAbsenceId: 'rtt',
        dateDebut: '2026-10-30',
        dateFin: '2026-11-03',
      }),
    ]);
    // 1er et 2 octobre (a1) + 30 octobre (a2) = 3 jours = 6 demi-journées.
    expect(g.lignes[0]?.demiJourneesAbsence).toBe(6);
    expect(g.lignes[1]?.demiJourneesAbsence).toBe(0);
  });
});

describe('navigation mensuelle', () => {
  it('clé de mois et mois voisins (changement d’année)', () => {
    expect(cleMois(2026, 3)).toBe('2026-03');
    expect(moisVoisin(2026, 1, -1)).toEqual({ annee: 2025, mois: 12 });
    expect(moisVoisin(2026, 12, 1)).toEqual({ annee: 2027, mois: 1 });
    expect(moisVoisin(2026, 10, 0)).toEqual({ annee: 2026, mois: 10 });
  });
});

describe('compacterGrille / decompacterCellules', () => {
  const g = grille([
    absence({
      id: 'c',
      employeId: 'e1',
      typeAbsenceId: 'cp',
      dateDebut: '2026-10-12',
      dateFin: '2026-10-16',
    }),
    absence({
      id: 'r',
      employeId: 'e2',
      typeAbsenceId: 'rtt',
      dateDebut: '2026-10-21',
      dateFin: '2026-10-22',
      demiJourneeDebut: true,
      demiJourneeFin: true,
      statut: 'en_attente',
    }),
  ]);
  const compacte = compacterGrille(g);

  it('reconstruit exactement les cellules de chaque ligne (aller-retour)', () => {
    for (const [i, ligne] of compacte.lignes.entries()) {
      expect(decompacterCellules(compacte.jours, compacte.segments, ligne)).toEqual(
        g.lignes[i]!.cellules,
      );
    }
  });

  it('ne transmet que les cellules porteuses, segments dédoublonnés', () => {
    // e1 : congé du 12 au 16, sauf le 14 (férié de son site) et le 15 (férié global) ;
    // e2 : deux demi-journées.
    expect(compacte.segments.map((s) => s.absenceId).sort()).toEqual(['c', 'r']);
    const [e1, e2] = compacte.lignes;
    expect(e1!.absences.map(([j]) => j)).toEqual([11, 12, 15]);
    expect(e2!.absences).toEqual([
      [20, -1, 1],
      [21, 1, -1],
    ]);
    // Le férié de site (14/10) n'existe que pour e1 ; le férié global reste porté par `jours`.
    expect(e1!.feries).toEqual([[13, 'Fête locale']]);
    expect(e2!.feries).toEqual([]);
  });

  it('conserve l’en-tête et les compteurs', () => {
    expect(compacte.jours).toBe(g.jours);
    expect(compacte.lignes.map((l) => l.demiJourneesAbsence)).toEqual(
      g.lignes.map((l) => l.demiJourneesAbsence),
    );
    expect(compacte.lignes.map((l) => l.employe)).toEqual(g.lignes.map((l) => l.employe));
  });
});
