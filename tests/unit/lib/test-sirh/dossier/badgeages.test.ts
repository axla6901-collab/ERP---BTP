import { describe, expect, it } from 'vitest';

import { regrouperParSemaine, type BadgeageResume } from '@/lib/test-sirh/dossier/badgeages';

function badgeage(
  partiel: Partial<BadgeageResume> & { id: string; dateBadgeage: string },
): BadgeageResume {
  return {
    heureDebut: '07:30',
    heureFin: '16:30',
    pauseMinutes: 60,
    minutes: 480,
    enCours: false,
    valide: true,
    chantierLabel: null,
    ...partiel,
  };
}

describe('regrouperParSemaine', () => {
  it('regroupe du lundi au dimanche, semaines récentes d’abord', () => {
    const semaines = regrouperParSemaine([
      badgeage({ id: 'a', dateBadgeage: '2026-10-12' }), // lundi S42
      badgeage({ id: 'b', dateBadgeage: '2026-10-18' }), // dimanche S42
      badgeage({ id: 'c', dateBadgeage: '2026-10-19' }), // lundi S43
    ]);
    expect(semaines.map((s) => s.lundi)).toEqual(['2026-10-19', '2026-10-12']);
    expect(semaines[1]?.dimanche).toBe('2026-10-18');
    expect(semaines[1]?.badgeages.map((b) => b.id)).toEqual(['b', 'a']);
  });

  it('totalise les minutes terminées et compte en cours / non validés', () => {
    const [semaine] = regrouperParSemaine([
      badgeage({ id: 'a', dateBadgeage: '2026-10-19', minutes: 450 }),
      badgeage({ id: 'b', dateBadgeage: '2026-10-20', minutes: 480, valide: false }),
      badgeage({
        id: 'c',
        dateBadgeage: '2026-10-21',
        heureFin: null,
        minutes: null,
        enCours: true,
        valide: false,
      }),
    ]);
    expect(semaine?.minutes).toBe(930);
    expect(semaine?.nbNonValides).toBe(2);
    expect(semaine?.nbEnCours).toBe(1);
  });

  it('trie les badgeages d’un même jour par heure décroissante', () => {
    const [semaine] = regrouperParSemaine([
      badgeage({ id: 'matin', dateBadgeage: '2026-10-19', heureDebut: '07:00' }),
      badgeage({ id: 'aprem', dateBadgeage: '2026-10-19', heureDebut: '13:30' }),
    ]);
    expect(semaine?.badgeages.map((b) => b.id)).toEqual(['aprem', 'matin']);
  });

  it('liste vide → aucune semaine', () => {
    expect(regrouperParSemaine([])).toEqual([]);
  });
});
