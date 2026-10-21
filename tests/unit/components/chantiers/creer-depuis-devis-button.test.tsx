import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { pushMock, refreshMock, toastMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { CreerDepuisDevisButton } from '@/components/chantiers/creer-depuis-devis-button';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CreerDepuisDevisButton', () => {
  it('ouvre le chantier créé via l’URL préfixée par le slug d’entreprise', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: { id: 'c9', numero: 'CH-001' } });
    render(<CreerDepuisDevisButton devisId="d1" action={action} />);

    fireEvent.click(screen.getByRole('button', { name: /créer le chantier/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/acme/chantiers/c9'));
    expect(action).toHaveBeenCalledWith('d1');
    expect(toastMock.success).toHaveBeenCalledWith('Chantier CH-001 créé.');
  });

  it('en cas d’échec : affiche l’erreur sans naviguer', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'Devis non accepté.' });
    render(<CreerDepuisDevisButton devisId="d1" action={action} />);

    fireEvent.click(screen.getByRole('button', { name: /créer le chantier/i }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Devis non accepté.'));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
