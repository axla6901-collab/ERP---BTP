import { describe, expect, it } from 'vitest';

import {
  effectifEquipe,
  membreActif,
  membreNonTermine,
  statutMembre,
} from '@/lib/test-sirh/organisation/membres';

const TODAY = '2026-10-19';

describe('appartenance aux équipes', () => {
  it('statut selon les bornes (inclusives)', () => {
    expect(statutMembre({ dateDebut: null, dateFin: null }, TODAY)).toBe('actif');
    expect(statutMembre({ dateDebut: '2026-10-19', dateFin: '2026-10-19' }, TODAY)).toBe('actif');
    expect(statutMembre({ dateDebut: '2026-10-20', dateFin: null }, TODAY)).toBe('a_venir');
    expect(statutMembre({ dateDebut: null, dateFin: '2026-10-18' }, TODAY)).toBe('termine');
  });

  it('membre actif / non terminé', () => {
    expect(membreActif({ dateDebut: '2026-10-20', dateFin: null }, TODAY)).toBe(false);
    expect(membreNonTermine({ dateDebut: '2026-10-20', dateFin: null }, TODAY)).toBe(true);
    expect(membreNonTermine({ dateDebut: null, dateFin: '2026-01-01' }, TODAY)).toBe(false);
  });

  it('effectif : membres actifs comptés une seule fois', () => {
    expect(
      effectifEquipe(
        [
          { employeId: 'a', dateDebut: null, dateFin: null },
          { employeId: 'a', dateDebut: '2026-01-01', dateFin: null },
          { employeId: 'b', dateDebut: null, dateFin: '2026-09-30' },
          { employeId: 'c', dateDebut: '2027-01-01', dateFin: null },
          { employeId: 'd', dateDebut: '2025-01-01', dateFin: '2026-12-31' },
        ],
        TODAY,
      ),
    ).toBe(2);
  });
});
