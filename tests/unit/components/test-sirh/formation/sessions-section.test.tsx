import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SessionsSection,
  type SessionLigneUI,
} from '@/components/test-sirh/formation/sessions-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sessions: SessionLigneUI[] = [
  {
    id: 's1',
    formationId: 'f1',
    formationIntitule: 'Sauveteur secouriste du travail',
    formationCode: 'SST',
    dateDebut: '2026-10-12',
    dateFin: '2026-10-13',
    lieu: 'Centre de Lyon',
    formateur: 'M. Bernard',
    placesMax: 8,
    statut: 'confirmee',
    nbInscrits: 6,
    nbPresents: 0,
    coutEstime: 1500,
  },
  {
    id: 's2',
    formationId: 'f2',
    formationIntitule: 'CACES R489',
    formationCode: null,
    dateDebut: '2026-11-20',
    dateFin: '2026-11-20',
    lieu: null,
    formateur: null,
    placesMax: null,
    statut: 'planifiee',
    nbInscrits: 1,
    nbPresents: 0,
    coutEstime: 0,
  },
];

function rendre(peutGerer = true) {
  render(
    <SessionsSection
      sessions={sessions}
      base="/acme/test-sirh"
      peutGerer={peutGerer}
      formations={[{ id: 'f1', label: 'SST', actif: true }]}
      today="2026-10-19"
      enregistrer={vi.fn()}
    />,
  );
}

describe('SessionsSection', () => {
  it('affiche dates, lieu, remplissage, coût et statut', () => {
    rendre();
    expect(screen.getByText('Sauveteur secouriste du travail')).toBeInTheDocument();
    expect(screen.getByText('12/10/2026 → 13/10/2026')).toBeInTheDocument();
    expect(screen.getByText('20/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Centre de Lyon')).toBeInTheDocument();
    expect(screen.getByText('M. Bernard')).toBeInTheDocument();
    expect(screen.getByText('6 / 8 inscrits')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('1 500,00 €')).toBeInTheDocument();
    expect(screen.getByText('Confirmée')).toBeInTheDocument();
  });

  it('signale une session terminée non clôturée', () => {
    rendre();
    expect(screen.getByText('À clôturer')).toBeInTheDocument();
  });

  it('création réservée à la gestion', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /nouvelle session/i })).not.toBeInTheDocument();
  });
});
