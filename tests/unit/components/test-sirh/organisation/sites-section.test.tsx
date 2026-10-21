import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SitesSection, type SiteLigne } from '@/components/test-sirh/organisation/sites-section';

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

const sites: SiteLigne[] = [
  {
    id: 's1',
    code: 'LYO',
    nom: 'Agence de Lyon',
    typeSite: 'agence',
    adresseLigne1: '12 rue des Bâtisseurs',
    adresseLigne2: null,
    codePostal: '69003',
    ville: 'Lyon',
    pays: 'France',
    telephone: null,
    actif: true,
    notes: null,
    nbCollaborateurs: 12,
  },
  {
    id: 's2',
    code: null,
    nom: 'Dépôt de Vénissieux',
    typeSite: 'depot',
    adresseLigne1: null,
    adresseLigne2: null,
    codePostal: null,
    ville: null,
    pays: 'France',
    telephone: null,
    actif: false,
    notes: null,
    nbCollaborateurs: 0,
  },
];

describe('SitesSection', () => {
  it('affiche les sites, leur type, localisation, effectif et statut', () => {
    render(<SitesSection sites={sites} peutGerer actions={actions} />);
    expect(screen.getByText('Agence de Lyon')).toBeInTheDocument();
    expect(screen.getByText('LYO')).toBeInTheDocument();
    expect(screen.getByText('Dépôt')).toBeInTheDocument();
    expect(screen.getByText('69003 Lyon')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nouveau site/i })).toBeInTheDocument();
  });

  it('masque les actions de gestion en lecture seule', () => {
    render(<SitesSection sites={sites} peutGerer={false} actions={actions} />);
    expect(screen.queryByRole('button', { name: /nouveau site/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /supprimer/i })).not.toBeInTheDocument();
  });

  it('affiche l’état vide', () => {
    render(<SitesSection sites={[]} peutGerer actions={actions} />);
    expect(screen.getByText(/aucun site/i)).toBeInTheDocument();
  });

  it('demande confirmation puis appelle la suppression', async () => {
    render(<SitesSection sites={[sites[0]!]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByText('Supprimer ce site ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith('s1'));
  });
});
