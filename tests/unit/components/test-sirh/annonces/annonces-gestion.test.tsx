import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AnnoncesGestion } from '@/components/test-sirh/annonces/annonces-gestion';
import type { AnnonceAffichee } from '@/lib/test-sirh/annonces/types';

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

const TODAY = '2026-10-19';
const A1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const A2 = '8a7d6c5b-4e3f-4a1b-9c2d-1e0f2a3b4c5d';

const annonce = (p: Partial<AnnonceAffichee> & { id: string; titre: string }): AnnonceAffichee => ({
  contenu: 'Contenu',
  categorie: 'information',
  epinglee: false,
  publiee: true,
  datePublication: '2026-10-15',
  dateExpiration: null,
  siteId: null,
  siteNom: null,
  equipeId: null,
  equipeNom: null,
  auteur: 'rh@acme.fr',
  createdAt: '2026-10-15T08:00:00.000Z',
  ...p,
});

const annonces = [
  annonce({ id: A1, titre: 'Nouveau process de badgeage' }),
  annonce({ id: A2, titre: 'Projet de note RH', publiee: false }),
];

const actions = () => ({
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'n' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  basculerEpingle: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
});

function rendre(a = actions()) {
  render(
    <AnnoncesGestion
      annonces={annonces}
      today={TODAY}
      sites={[{ id: 's1', label: 'Agence de Lyon' }]}
      equipes={[{ id: 'e1', label: 'Gros œuvre' }]}
      actions={a}
    />,
  );
  return a;
}

describe('AnnoncesGestion', () => {
  it('filtre par statut (en ligne par défaut, brouillons)', () => {
    rendre();
    expect(screen.getByText('Nouveau process de badgeage')).toBeInTheDocument();
    expect(screen.queryByText('Projet de note RH')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^brouillons/i }));
    expect(screen.getByText('Projet de note RH')).toBeInTheDocument();
    expect(screen.queryByText('Nouveau process de badgeage')).not.toBeInTheDocument();
  });

  it('épingle une annonce', async () => {
    const a = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Épingler Nouveau process de badgeage' }));
    await waitFor(() => expect(a.basculerEpingle).toHaveBeenCalledWith({ id: A1, epinglee: true }));
  });

  it('supprime une annonce après confirmation', async () => {
    const a = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(a.supprimer).toHaveBeenCalledWith(A1));
  });

  it('rédige et publie une annonce (publication aujourd’hui, toute l’entreprise)', async () => {
    const a = rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle annonce/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Titre'), {
      target: { value: 'Fermeture du dépôt' },
    });
    fireEvent.change(within(dialog).getByLabelText('Contenu'), {
      target: { value: 'Fermé du 3 au 21 août.\nAnticipez vos retraits.' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publier' }));
    await waitFor(() =>
      expect(a.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          titre: 'Fermeture du dépôt',
          contenu: 'Fermé du 3 au 21 août.\nAnticipez vos retraits.',
          categorie: 'information',
          publiee: true,
          epinglee: false,
          datePublication: TODAY,
          dateExpiration: null,
          siteId: null,
          equipeId: null,
        }),
      ),
    );
  });

  it('refuse une expiration antérieure à la publication', async () => {
    const a = rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle annonce/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Titre'), { target: { value: 'Info' } });
    fireEvent.change(within(dialog).getByLabelText('Contenu'), { target: { value: 'Texte' } });
    fireEvent.change(within(dialog).getByLabelText('Date d’expiration'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publier' }));
    await waitFor(() =>
      expect(within(dialog).getByText(/doit être postérieure ou égale/)).toBeInTheDocument(),
    );
    expect(a.enregistrer).not.toHaveBeenCalled();
  });
});
