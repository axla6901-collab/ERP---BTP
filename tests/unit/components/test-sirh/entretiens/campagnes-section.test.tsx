import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CampagnesSection,
  type CampagneLigneUI,
} from '@/components/test-sirh/entretiens/campagnes-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
  // base-ui Dialog / Select s'appuient sur des API absentes de jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const C1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const C2 = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const campagnes: CampagneLigneUI[] = [
  {
    id: C1,
    libelle: 'Entretiens annuels 2026',
    typeEntretien: 'annuel',
    dateDebut: '2026-10-01',
    dateLimite: '2026-12-15',
    statut: 'en_cours',
    description: 'Campagne de fin d’année',
    total: 10,
    realises: 4,
    annules: 1,
    pourcentage: 40,
  },
  {
    id: C2,
    libelle: 'Entretiens professionnels',
    typeEntretien: 'professionnel',
    dateDebut: null,
    dateLimite: null,
    statut: 'brouillon',
    description: null,
    total: 0,
    realises: 0,
    annules: 0,
    pourcentage: 0,
  },
];

function creerActions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: C1 } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    lancer: vi.fn().mockResolvedValue({ ok: true, data: { crees: 6, existants: 0 } }),
    changerStatut: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

function rendre(peutGerer = true, actions = creerActions(), lignes = campagnes) {
  render(
    <CampagnesSection
      campagnes={lignes}
      peutGerer={peutGerer}
      base="/acme/test-sirh"
      sites={[{ id: 'site-1', label: 'Agence de Lyon' }]}
      equipes={[]}
      actions={actions}
    />,
  );
  return actions;
}

describe('CampagnesSection', () => {
  it('affiche les campagnes, leur statut et leur progression', () => {
    rendre();
    expect(screen.getByText('Entretiens annuels 2026')).toBeInTheDocument();
    expect(screen.getByText('Campagne de fin d’année')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    expect(screen.getByText('4 / 10 réalisés · 40 %')).toBeInTheDocument();
    expect(screen.getByText('Aucun entretien')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /entretiens annuels 2026/i })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
  });

  it('propose « Lancer » (brouillon), « Compléter » et « Clôturer » (en cours)', () => {
    rendre();
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compléter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clôturer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nouvelle campagne/i })).toBeInTheDocument();
  });

  it('masque la gestion en lecture seule', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /nouvelle campagne/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lancer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('affiche l’état vide', () => {
    rendre(true, creerActions(), []);
    expect(screen.getByText(/aucune campagne/i)).toBeInTheDocument();
  });

  it('lance une campagne brouillon depuis la modale', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
    expect(await screen.findByText('Lancer la campagne')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /générer les entretiens/i }));
    await waitFor(() =>
      expect(actions.lancer).toHaveBeenCalledWith({ campagneId: C2, siteId: null, equipeId: null }),
    );
  });

  it('clôture une campagne en cours après confirmation', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Clôturer' }));
    expect(screen.getByText('Clôturer la campagne ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Clôturer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(actions.changerStatut).toHaveBeenCalledWith(C1, 'cloturee'));
  });

  it('crée une campagne via la modale', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle campagne/i }));
    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Points de mi-année' },
    });
    fireEvent.click(screen.getByRole('button', { name: /créer la campagne/i }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({ libelle: 'Points de mi-année', typeEntretien: 'annuel' }),
      ),
    );
  });

  it('verrouille le type d’une campagne qui a déjà des entretiens', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Entretiens annuels 2026' }));
    expect(await screen.findByText(/le type n’est plus modifiable/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Libellé')).toHaveValue('Entretiens annuels 2026');
  });
});
