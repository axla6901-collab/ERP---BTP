import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CorpsCalendrier } from '@/components/test-sirh/absences/corps-calendrier';
import {
  compacterGrille,
  construireGrilleMois,
  type TypeCalendrier,
} from '@/lib/test-sirh/absences/calendrier-equipe';

const TYPES: TypeCalendrier[] = [
  { id: 'rtt', code: 'RTT', libelle: 'RTT', couleur: '#0ea5e9', uniteDecompte: 'jours_ouvres' },
];

function grilleCompacte(nbEmployes: number) {
  return compacterGrille(
    construireGrilleMois({
      annee: 2026,
      mois: 10,
      employes: Array.from({ length: nbEmployes }, (_, i) => ({
        id: `e${i + 1}`,
        label: `Salarié ${String(i + 1).padStart(3, '0')}`,
        siteId: null,
      })),
      absences: [
        {
          id: 'a1',
          employeId: 'e1',
          typeAbsenceId: 'rtt',
          dateDebut: '2026-10-21',
          dateFin: '2026-10-21',
          demiJourneeDebut: false,
          demiJourneeFin: false,
          statut: 'approuvee',
        },
      ],
      feries: [],
      types: TYPES,
      today: '2026-10-19',
    }),
  );
}

function renderCorps(nbEmployes: number) {
  const g = grilleCompacte(nbEmployes);
  return render(
    <table>
      <CorpsCalendrier jours={g.jours} segments={g.segments} lignes={g.lignes} types={TYPES} />
    </table>,
  );
}

const lignesRendues = () => screen.queryAllByRole('rowheader').length;

describe('CorpsCalendrier — affichage progressif', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('rend 40 collaborateurs d’abord, puis le reste par tranches', async () => {
    renderCorps(100);
    expect(lignesRendues()).toBe(40);
    expect(screen.getByText('Affichage des collaborateurs… 40 / 100')).toBeInTheDocument();

    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20);
      });
    }

    expect(lignesRendues()).toBe(100);
    expect(screen.getByRole('rowheader', { name: 'Salarié 100' })).toBeInTheDocument();
    expect(screen.queryByText(/Affichage des collaborateurs…/)).toBeNull();
  });

  it('rend une petite équipe d’un coup, absences comprises', () => {
    renderCorps(3);
    expect(lignesRendues()).toBe(3);
    expect(screen.getAllByTestId('segment-absence')).toHaveLength(1);
    expect(screen.queryByText(/Affichage des collaborateurs…/)).toBeNull();
  });
});
