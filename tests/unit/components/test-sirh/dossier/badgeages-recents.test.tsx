import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BadgeagesRecents } from '@/components/test-sirh/dossier/badgeages-recents';

afterEach(cleanup);

describe('BadgeagesRecents', () => {
  it('affiche la semaine, son total, les badges et les lignes', () => {
    render(
      <BadgeagesRecents
        lienFeuille="/acme/test-sirh/temps"
        badgeages={[
          {
            id: 'a',
            dateBadgeage: '2026-10-19',
            heureDebut: '07:30',
            heureFin: '16:00',
            pauseMinutes: 60,
            minutes: 450,
            enCours: false,
            valide: false,
            chantierLabel: 'CH-12 · Résidence Les Tilleuls',
          },
          {
            id: 'b',
            dateBadgeage: '2026-10-20',
            heureDebut: '07:30',
            heureFin: null,
            pauseMinutes: 0,
            minutes: null,
            enCours: true,
            valide: false,
            chantierLabel: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('Semaine du 19/10/2026 au 25/10/2026')).toBeInTheDocument();
    expect(screen.getByText('1 en cours')).toBeInTheDocument();
    expect(screen.getByText('2 à valider')).toBeInTheDocument();
    expect(screen.getAllByText('7 h 30')).toHaveLength(2); // total semaine + ligne
    expect(screen.getByText('CH-12 · Résidence Les Tilleuls')).toBeInTheDocument();
    expect(screen.getByText('en cours')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /feuille de temps/i })).toHaveAttribute(
      'href',
      '/acme/test-sirh/temps',
    );
  });

  it('état vide sans lien', () => {
    render(<BadgeagesRecents badgeages={[]} />);
    expect(screen.getByText(/aucun badgeage/i)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
