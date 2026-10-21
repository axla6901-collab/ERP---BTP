import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ModelesSection } from '@/components/test-sirh/onboarding/modeles-section';
import type { ModeleProcessusLigne } from '@/lib/test-sirh/onboarding/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
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

const M1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const M2 = '8a7d6c5b-4e3f-4a1b-9c2d-1e0f2a3b4c5d';

const modeles: ModeleProcessusLigne[] = [
  {
    id: M1,
    nom: 'Intégration compagnon BTP',
    typeProcessus: 'onboarding',
    description: 'Parcours d’arrivée sur chantier.',
    actif: true,
    nbProcessus: 2,
    taches: [
      {
        id: 'mt1',
        modeleId: M1,
        libelle: 'Préparer le contrat',
        description: null,
        responsable: 'rh',
        delaiJours: -5,
        ordre: 10,
      },
      {
        id: 'mt2',
        modeleId: M1,
        libelle: 'Accueil sécurité',
        description: null,
        responsable: 'manager',
        delaiJours: 0,
        ordre: 20,
      },
      {
        id: 'mt3',
        modeleId: M1,
        libelle: 'Point à un mois',
        description: null,
        responsable: 'manager',
        delaiJours: 30,
        ordre: 30,
      },
    ],
  },
  {
    id: M2,
    nom: 'Mobilité interne',
    typeProcessus: 'mobilite',
    description: null,
    actif: false,
    nbProcessus: 0,
    taches: [],
  },
];

const actions = () => ({
  enregistrerModele: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
  supprimerModele: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  enregistrerTache: vi.fn().mockResolvedValue({ ok: true, data: { id: 'y' } }),
  supprimerTache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  deplacerTache: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
});

describe('ModelesSection', () => {
  it('liste les modèles actifs avec leurs tâches ordonnées et leurs délais', () => {
    render(<ModelesSection modeles={modeles} actions={actions()} />);
    expect(screen.getByText('Intégration compagnon BTP')).toBeInTheDocument();
    expect(screen.queryByText('Mobilité interne')).not.toBeInTheDocument();
    expect(screen.getByText(/3 tâches · utilisé par 2 processus/)).toBeInTheDocument();
    expect(screen.getByText('J-5')).toBeInTheDocument();
    expect(screen.getByText('Jour J')).toBeInTheDocument();
    expect(screen.getByText('J+30')).toBeInTheDocument();
    // Modèle utilisé : désactivation proposée, pas de suppression du modèle.
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Supprimer' })).toHaveLength(3); // tâches
  });

  it('monte / descend une tâche (bornes désactivées)', async () => {
    const a = actions();
    render(<ModelesSection modeles={modeles} actions={a} />);
    expect(screen.getByRole('button', { name: 'Monter Préparer le contrat' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descendre Point à un mois' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Monter Accueil sécurité' }));
    await waitFor(() => expect(a.deplacerTache).toHaveBeenCalledWith({ id: 'mt2', sens: 'haut' }));
  });

  it('modèle inactif jamais utilisé : réactivation ou suppression après confirmation', async () => {
    const a = actions();
    render(<ModelesSection modeles={modeles} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: /^inactifs/i }));
    expect(screen.getByText('Mobilité interne')).toBeInTheDocument();
    expect(screen.getByText('Aucune tâche dans ce modèle.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réactiver' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByText('Supprimer ce modèle et ses tâches ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(a.supprimerModele).toHaveBeenCalledWith(M2));
  });

  it('crée un modèle', async () => {
    const a = actions();
    render(<ModelesSection modeles={modeles} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: /nouveau modèle/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nom'), {
      target: { value: 'Intégration ETAM' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /créer le modèle/i }));
    await waitFor(() =>
      expect(a.enregistrerModele).toHaveBeenCalledWith({
        id: undefined,
        nom: 'Intégration ETAM',
        typeProcessus: 'onboarding',
        description: null,
        actif: true,
      }),
    );
  });

  it('ajoute une tâche au modèle avec un délai négatif', async () => {
    const a = actions();
    render(<ModelesSection modeles={modeles} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: /ajouter une tâche/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Libellé'), {
      target: { value: 'Effectuer la DPAE' },
    });
    fireEvent.change(within(dialog).getByLabelText('Délai (jours)'), { target: { value: '-3' } });
    expect(within(dialog).getByText(/J-3 — négatif = avant/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /^ajouter la tâche$/i }));
    await waitFor(() =>
      expect(a.enregistrerTache).toHaveBeenCalledWith(
        expect.objectContaining({
          modeleId: M1,
          libelle: 'Effectuer la DPAE',
          responsable: 'rh',
          delaiJours: -3,
        }),
      ),
    );
  });
});
