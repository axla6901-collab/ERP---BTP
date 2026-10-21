import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ActionsPeriode } from '@/components/test-sirh/paie/actions-periode';
import { PeriodesSection, type PeriodeLigne } from '@/components/test-sirh/paie/periodes-section';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }),
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

const P1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

const periodes: PeriodeLigne[] = [
  {
    id: P1,
    annee: 2026,
    mois: 10,
    statut: 'ouverte',
    dateCloture: null,
    clotureParEmail: null,
    notes: null,
    nbVariables: 14,
    nbEmployes: 6,
    montantTotal: 1234.5,
  },
  {
    id: 'p2',
    annee: 2026,
    mois: 9,
    statut: 'cloturee',
    dateCloture: '2026-10-03T16:00:00.000Z',
    clotureParEmail: 'paie@exemple.fr',
    notes: 'Clôture avec régularisation',
    nbVariables: 20,
    nbEmployes: 8,
    montantTotal: 2500,
  },
];

describe('PeriodesSection', () => {
  it('liste les périodes avec statut, compteurs et montants', () => {
    render(
      <PeriodesSection
        periodes={periodes}
        cheminPaie="/acme/test-sirh/paie"
        proposition={{ annee: 2026, mois: 11 }}
        actions={{ creer: vi.fn() }}
      />,
    );
    expect(screen.getByText('Octobre 2026')).toBeInTheDocument();
    expect(screen.getByText('Septembre 2026')).toBeInTheDocument();
    expect(screen.getByText('Ouverte')).toBeInTheDocument();
    expect(screen.getByText('Clôturée')).toBeInTheDocument();
    // 16:00 UTC = 18:00 heure de Paris (heure d'été).
    expect(screen.getByText('03/10/2026 18:00 · paie@exemple.fr')).toBeInTheDocument();
    expect(screen.getByText('1 234,50 €')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('crée la période proposée puis ouvre sa préparation', async () => {
    const creer = vi.fn().mockResolvedValue({ ok: true, data: { id: 'nouvelle' } });
    render(
      <PeriodesSection
        periodes={periodes}
        cheminPaie="/acme/test-sirh/paie"
        proposition={{ annee: 2026, mois: 11 }}
        actions={{ creer }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /nouvelle période/i }));
    expect(await screen.findByText('Nouvelle période de paie')).toBeInTheDocument();
    expect(screen.getByLabelText('Année')).toHaveValue(2026);
    fireEvent.click(screen.getByRole('button', { name: 'Créer la période' }));
    await waitFor(() => expect(creer).toHaveBeenCalledWith({ annee: 2026, mois: 11, notes: null }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/acme/test-sirh/paie/nouvelle'));
  });

  it('affiche l’erreur d’unicité renvoyée par le serveur', async () => {
    const creer = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'La période de Novembre 2026 existe déjà.' });
    render(
      <PeriodesSection
        periodes={[]}
        cheminPaie="/acme/test-sirh/paie"
        proposition={{ annee: 2026, mois: 11 }}
        actions={{ creer }}
      />,
    );
    expect(screen.getByText(/aucune période de paie/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle période/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Créer la période' }));
    expect(await screen.findByText('La période de Novembre 2026 existe déjà.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('ActionsPeriode', () => {
  const actions = () => ({
    changerStatut: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  });

  it('propose le passage en contrôle et la suppression d’une période ouverte vide', async () => {
    const a = actions();
    render(
      <ActionsPeriode
        periodeId={P1}
        statut="ouverte"
        peutGerer={false}
        supprimable
        cheminPaie="/acme/test-sirh/paie"
        actions={a}
      />,
    );
    expect(screen.getByRole('button', { name: 'Supprimer la période' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Passer en contrôle' }));
    expect(screen.getByText('Passer la période en contrôle ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Passer en contrôle' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() =>
      expect(a.changerStatut).toHaveBeenCalledWith({ id: P1, statut: 'en_controle' }),
    );
  });

  it('propose clôture et retour en saisie en contrôle', () => {
    render(
      <ActionsPeriode
        periodeId={P1}
        statut="en_controle"
        peutGerer={false}
        supprimable={false}
        cheminPaie="/acme/test-sirh/paie"
        actions={actions()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Clôturer la période' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revenir en saisie' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer la période' })).not.toBeInTheDocument();
  });

  it('réserve la réouverture aux gestionnaires RH', () => {
    const { rerender } = render(
      <ActionsPeriode
        periodeId={P1}
        statut="cloturee"
        peutGerer={false}
        supprimable={false}
        cheminPaie="/acme/test-sirh/paie"
        actions={actions()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Rouvrir la période' })).not.toBeInTheDocument();
    rerender(
      <ActionsPeriode
        periodeId={P1}
        statut="cloturee"
        peutGerer
        supprimable={false}
        cheminPaie="/acme/test-sirh/paie"
        actions={actions()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Rouvrir la période' })).toBeInTheDocument();
  });
});
