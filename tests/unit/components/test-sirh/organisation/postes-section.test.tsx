import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  libelleClassification,
  PostesSection,
  type PosteLigneUI,
} from '@/components/test-sirh/organisation/postes-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const actions = {
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

const postes: PosteLigneUI[] = [
  {
    id: 'p1',
    code: 'MAC-N2',
    intitule: 'Maçon',
    famille: 'Gros œuvre',
    categorie: 'ouvrier',
    niveau: 'N2',
    coefficient: '185',
    description: null,
    actif: true,
    nbCollaborateurs: 7,
    nbContrats: 9,
  },
  {
    id: 'p2',
    code: null,
    intitule: 'Conducteur de travaux',
    famille: 'Encadrement',
    categorie: 'cadre',
    niveau: null,
    coefficient: null,
    description: 'Pilotage des chantiers',
    actif: false,
    nbCollaborateurs: 0,
    nbContrats: 0,
  },
];

describe('PostesSection', () => {
  it('affiche le catalogue : code, famille, catégorie, classification, effectif, statut', () => {
    render(<PostesSection postes={postes} peutGerer actions={actions} />);
    expect(screen.getByText('Maçon')).toBeInTheDocument();
    expect(screen.getByText('MAC-N2')).toBeInTheDocument();
    expect(screen.getByText('Gros œuvre')).toBeInTheDocument();
    expect(screen.getByText('Ouvrier')).toBeInTheDocument();
    expect(screen.getByText('N2 · coef. 185')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Cadre')).toBeInTheDocument();
    expect(screen.getByText('Pilotage des chantiers')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('masque les actions de gestion en lecture seule', () => {
    render(<PostesSection postes={postes} peutGerer={false} actions={actions} />);
    expect(screen.queryByRole('button', { name: /nouveau poste/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('affiche l’état vide', () => {
    render(<PostesSection postes={[]} peutGerer actions={actions} />);
    expect(screen.getByText(/aucun poste/i)).toBeInTheDocument();
  });

  it('crée un poste depuis la modale', async () => {
    render(<PostesSection postes={postes} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: /nouveau poste/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Intitulé'), {
      target: { value: "Chef d'équipe" },
    });
    fireEvent.change(within(dialog).getByLabelText('Coefficient'), { target: { value: '230' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le poste' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          intitule: "Chef d'équipe",
          coefficient: '230',
          code: null,
          categorie: null,
          actif: true,
        }),
      ),
    );
  });

  it('affiche l’erreur serveur (suppression référentielle) en toast', async () => {
    const { toast } = await import('sonner');
    actions.supprimer.mockResolvedValueOnce({
      ok: false,
      error: 'Suppression impossible : ce poste est référencé par 7 collaborateurs.',
    });
    render(<PostesSection postes={[postes[0]!]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Suppression impossible : ce poste est référencé par 7 collaborateurs.',
      ),
    );
  });

  it('libellé de classification', () => {
    expect(libelleClassification({ niveau: 'N3P1', coefficient: null })).toBe('N3P1');
    expect(libelleClassification({ niveau: null, coefficient: null })).toBeNull();
  });
});
