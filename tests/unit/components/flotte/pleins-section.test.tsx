import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PleinsSection } from '@/components/flotte/pleins-section';
import type { SyntheseConsommation } from '@/lib/flotte/consommation';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const actions = {
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

const synthese: SyntheseConsommation = {
  nbPleins: 2,
  coutTotalHt: 135,
  distanceKm: 1500,
  litresTotal: 120,
  kwhTotal: 0,
  consoMoyenneLitres100: 8,
  consoMoyenneKwh100: null,
  coutMoyenKm: 0.12,
};

const pleins = [
  {
    id: 'p1',
    datePlein: '2026-06-12',
    kilometrage: 88000,
    volumeLitres: '52.30',
    energieKwh: null,
    prixHt: '78.90',
    pleinComplet: true,
    station: 'TotalEnergies A6',
    carteMasquee: '•••• 4521',
    conducteurNom: 'Marc Dubois',
  },
  {
    id: 'p2',
    datePlein: '2026-05-30',
    kilometrage: 87200,
    volumeLitres: '30.00',
    energieKwh: null,
    prixHt: '45.00',
    pleinComplet: false,
    station: null,
    carteMasquee: null,
    conducteurNom: null,
  },
];

describe('PleinsSection', () => {
  it('affiche la synthèse consommation, la carte masquée et le badge « Partiel »', () => {
    render(
      <PleinsSection
        vehiculeId="v1"
        pleins={pleins}
        synthese={synthese}
        employes={[]}
        electrique={false}
        peutEcrire
        actions={actions}
      />,
    );
    expect(screen.getByText('8 L/100 km')).toBeInTheDocument();
    expect(screen.getByText('0,12 €/km')).toBeInTheDocument();
    expect(screen.getByText('1 500 km')).toBeInTheDocument();
    expect(screen.getByText('•••• 4521')).toBeInTheDocument();
    expect(screen.getByText('Partiel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter un plein/i })).toBeInTheDocument();
  });

  it('bascule en mode recharge (kWh) pour un véhicule électrique', () => {
    render(
      <PleinsSection
        vehiculeId="v1"
        pleins={[]}
        synthese={{ ...synthese, nbPleins: 0 }}
        employes={[]}
        electrique
        peutEcrire
        actions={actions}
      />,
    );
    expect(screen.getByText(/aucun plein/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter une recharge/i })).toBeInTheDocument();
  });
});
