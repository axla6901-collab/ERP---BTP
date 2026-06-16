import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SinistresSection } from '@/components/flotte/sinistres-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const actions = {
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
  cloturer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

const sinistres = [
  {
    id: 's1',
    dateSinistre: '2026-05-02',
    numeroSinistre: 'SIN-2026-12',
    lieu: 'A6 Lyon',
    responsabilite: 'tort_partiel' as const,
    tiersImplique: true,
    montantDommagesHt: '2500.00',
    franchiseHt: '500.00',
    clos: false,
    dateCloture: null,
    conducteurNom: 'Marc Dubois',
  },
  {
    id: 's2',
    dateSinistre: '2025-11-20',
    numeroSinistre: null,
    lieu: null,
    responsabilite: 'non_responsable' as const,
    tiersImplique: false,
    montantDommagesHt: null,
    franchiseHt: null,
    clos: true,
    dateCloture: '2026-01-15',
    conducteurNom: null,
  },
];

describe('SinistresSection', () => {
  it('affiche les sinistres, la responsabilité et le statut (en cours / clos)', () => {
    render(
      <SinistresSection
        vehiculeId="v1"
        sinistres={sinistres}
        employes={[]}
        peutEcrire
        actions={actions}
      />,
    );
    expect(screen.getByText('Tort partiel')).toBeInTheDocument();
    expect(screen.getByText('Non responsable')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText(/Clos · 15\/01\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Tiers impliqué')).toBeInTheDocument();
    // Le bouton Clôturer n'apparaît que pour le sinistre ouvert.
    expect(screen.getAllByRole('button', { name: /clôturer/i })).toHaveLength(1);
  });

  it("affiche l'état vide et masque les actions en lecture seule", () => {
    render(
      <SinistresSection
        vehiculeId="v1"
        sinistres={[]}
        employes={[]}
        peutEcrire={false}
        actions={actions}
      />,
    );
    expect(screen.getByText(/aucun sinistre/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /déclarer un sinistre/i })).not.toBeInTheDocument();
  });
});
