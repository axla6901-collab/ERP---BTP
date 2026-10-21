import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { DeleteButton } from '@/components/catalogue/delete-button';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function confirmerSuppression() {
  fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
}

describe('DeleteButton — redirection après suppression', () => {
  it('préfixe par le slug d’entreprise un redirectTo sans slug', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(<DeleteButton action={action} redirectTo="/catalogue/familles" />);

    confirmerSuppression();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/acme/catalogue/familles'));
    expect(action).toHaveBeenCalledTimes(1);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('laisse intact un redirectTo déjà préfixé (idempotent)', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(<DeleteButton action={action} redirectTo="/acme/tiers/fournisseurs/f1" />);

    confirmerSuppression();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/acme/tiers/fournisseurs/f1'));
  });

  it('sans redirectTo : rafraîchit la page au lieu de naviguer', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(<DeleteButton action={action} />);

    confirmerSuppression();

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('en cas d’échec : ne navigue pas et revient au bouton initial', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'Référencé ailleurs.' });
    render(<DeleteButton action={action} redirectTo="/catalogue/familles" />);

    confirmerSuppression();

    expect(await screen.findByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
