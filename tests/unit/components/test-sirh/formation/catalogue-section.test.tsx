import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CatalogueSection,
  type FormationLigneUI,
} from '@/components/test-sirh/formation/catalogue-section';

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

const F1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const F2 = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const formations: FormationLigneUI[] = [
  {
    id: F1,
    code: 'SST',
    intitule: 'Sauveteur secouriste du travail',
    categorie: 'securite',
    organisme: 'INRS',
    modalite: 'presentiel',
    dureeHeures: '14.00',
    coutHt: '250.00',
    obligatoire: true,
    validiteMois: 24,
    description: null,
    actif: true,
    nbSessions: 3,
  },
  {
    id: F2,
    code: null,
    intitule: 'Travail en hauteur',
    categorie: 'securite',
    organisme: null,
    modalite: 'interne',
    dureeHeures: '7.00',
    coutHt: null,
    obligatoire: false,
    validiteMois: null,
    description: null,
    actif: false,
    nbSessions: 0,
  },
];

function creerActions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: F1 } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

describe('CatalogueSection', () => {
  it('affiche le catalogue : durée, coût, validité, obligation, statut', () => {
    render(<CatalogueSection formations={formations} peutGerer actions={creerActions()} />);
    expect(screen.getByText('Sauveteur secouriste du travail')).toBeInTheDocument();
    expect(screen.getByText('SST')).toBeInTheDocument();
    expect(screen.getByText('INRS')).toBeInTheDocument();
    expect(screen.getByText('14 h')).toBeInTheDocument();
    expect(screen.getByText('250,00 €')).toBeInTheDocument();
    expect(screen.getByText('2 ans')).toBeInTheDocument();
    expect(screen.getByText('Sans échéance')).toBeInTheDocument();
    expect(screen.getByText('Obligatoire')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('Formation interne')).toBeInTheDocument();
  });

  it('masque la gestion en lecture seule', () => {
    render(<CatalogueSection formations={formations} peutGerer={false} actions={creerActions()} />);
    expect(screen.queryByRole('button', { name: /nouvelle formation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('affiche l’état vide', () => {
    render(<CatalogueSection formations={[]} peutGerer actions={creerActions()} />);
    expect(screen.getByText(/aucune formation au catalogue/i)).toBeInTheDocument();
  });

  it('crée une formation et normalise les nombres', async () => {
    const actions = creerActions();
    render(<CatalogueSection formations={formations} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: /nouvelle formation/i }));
    fireEvent.change(await screen.findByLabelText('Intitulé'), {
      target: { value: 'CACES R489 — Chariots' },
    });
    fireEvent.change(screen.getByLabelText('Durée (h)'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Validité (mois)'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: /créer la formation/i }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          intitule: 'CACES R489 — Chariots',
          dureeHeures: '21.00',
          validiteMois: 60,
          categorie: 'technique',
          modalite: 'presentiel',
          obligatoire: false,
          actif: true,
          code: null,
        }),
      ),
    );
  });

  it('refuse une validité hors bornes', async () => {
    const actions = creerActions();
    render(<CatalogueSection formations={[]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: /nouvelle formation/i }));
    fireEvent.change(await screen.findByLabelText('Intitulé'), { target: { value: 'AIPR' } });
    fireEvent.change(screen.getByLabelText('Validité (mois)'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: /créer la formation/i }));
    expect(await screen.findByText(/validité doit être ≤ 240/i)).toBeInTheDocument();
    expect(actions.enregistrer).not.toHaveBeenCalled();
  });

  it('demande confirmation puis supprime', async () => {
    const actions = creerActions();
    render(<CatalogueSection formations={[formations[0]!]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByText('Supprimer cette formation ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith(F1));
  });
});
