import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { HorairesSection, type HoraireLigne } from '@/components/test-sirh/temps/horaires-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
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

const actions = {
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

const horaires: HoraireLigne[] = [
  {
    id: 'h1',
    nom: '35 h — lundi au vendredi',
    description: 'Durée légale',
    heuresLundi: '7.00',
    heuresMardi: '7.00',
    heuresMercredi: '7.00',
    heuresJeudi: '7.00',
    heuresVendredi: '7.00',
    heuresSamedi: '0.00',
    heuresDimanche: '0.00',
    totalHebdo: 35,
    parDefaut: true,
    actif: true,
    nbCollaborateurs: 12,
  },
  {
    id: 'h2',
    nom: '39 h — BTP',
    description: null,
    heuresLundi: '8.00',
    heuresMardi: '8.00',
    heuresMercredi: '8.00',
    heuresJeudi: '8.00',
    heuresVendredi: '7.00',
    heuresSamedi: '0.00',
    heuresDimanche: '0.00',
    totalHebdo: 39,
    parDefaut: false,
    actif: false,
    nbCollaborateurs: 0,
  },
];

describe('HorairesSection', () => {
  it('affiche les horaires, le total hebdomadaire, l’effectif et le défaut', () => {
    render(<HorairesSection horaires={horaires} peutGerer actions={actions} />);
    expect(screen.getByText('35 h — lundi au vendredi')).toBeInTheDocument();
    expect(screen.getByText('Par défaut')).toBeInTheDocument();
    expect(screen.getByText('35 h')).toBeInTheDocument();
    expect(screen.getByText('39 h')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('masque la gestion en lecture seule', () => {
    render(<HorairesSection horaires={horaires} peutGerer={false} actions={actions} />);
    expect(screen.queryByRole('button', { name: /nouvel horaire/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('affiche l’état vide', () => {
    render(<HorairesSection horaires={[]} peutGerer actions={actions} />);
    expect(screen.getByText(/aucun horaire/i)).toBeInTheDocument();
  });

  it('demande confirmation puis supprime', async () => {
    render(<HorairesSection horaires={[horaires[1]!]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByText('Supprimer cet horaire ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith('h2'));
  });

  it('crée un horaire et calcule le total hebdomadaire en direct', async () => {
    render(<HorairesSection horaires={[]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: /nouvel horaire/i }));
    expect(await screen.findByText('Total hebdomadaire :')).toBeInTheDocument();
    expect(screen.getByText('35 h')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Équipe 39 h' } });
    fireEvent.change(screen.getByLabelText('Lundi'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Mardi'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Mercredi'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Jeudi'), { target: { value: '8' } });
    expect(await screen.findByText('39 h')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’horaire' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          nom: 'Équipe 39 h',
          heuresLundi: '8.00',
          heuresVendredi: '7.00',
          parDefaut: false,
          actif: true,
        }),
      ),
    );
  });

  it('refuse un horaire sans aucune heure', async () => {
    render(<HorairesSection horaires={[]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: /nouvel horaire/i }));
    await screen.findByText('Total hebdomadaire :');
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Vide' } });
    for (const jour of ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi']) {
      fireEvent.change(screen.getByLabelText(jour), { target: { value: '0' } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’horaire' }));
    expect(
      await screen.findByText('Le total hebdomadaire doit être supérieur à 0 h.'),
    ).toBeInTheDocument();
    expect(actions.enregistrer).not.toHaveBeenCalled();
  });
});
