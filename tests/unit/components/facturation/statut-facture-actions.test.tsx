import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StatutFactureActions } from '@/components/facturation/statut-facture-actions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StatutFactureActions', () => {
  it('annonce le numéro légal attribué à l’émission d’un brouillon', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: { numero: 'F-2026-000001' } });
    render(<StatutFactureActions factureId="f1" statutCourant="brouillon" action={action} />);

    fireEvent.click(screen.getByRole('button', { name: 'Émise' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Facture F-2026-000001 émise'));
    expect(action).toHaveBeenCalledWith('f1', 'emise');
  });

  it('garde le message de statut pour les autres transitions', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true, data: { numero: null } });
    render(<StatutFactureActions factureId="f1" statutCourant="brouillon" action={action} />);

    fireEvent.click(screen.getByRole('button', { name: 'Annulée' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Statut → Annulée'));
  });

  it('affiche le refus du serveur (ex. chronologie de numérotation)', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'Émission impossible : …' });
    render(<StatutFactureActions factureId="f1" statutCourant="brouillon" action={action} />);

    fireEvent.click(screen.getByRole('button', { name: 'Émise' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Émission impossible : …'));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
