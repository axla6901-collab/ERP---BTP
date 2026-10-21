import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  BoutonDemandeHeuresSup,
  DemandeHeuresSupDialog,
} from '@/components/test-sirh/temps/demande-heures-sup-dialog';

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

const MOI = { id: '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70', label: 'Martin Paul' };

describe('DemandeHeuresSupDialog', () => {
  it('libre-service : collaborateur imposé, envoi des valeurs normalisées', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'n' } });
    const onOpenChange = vi.fn();
    render(
      <DemandeHeuresSupDialog
        open
        onOpenChange={onOpenChange}
        employeFixe={MOI}
        today="2026-10-19"
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText('Martin Paul')).toBeInTheDocument();
    expect(screen.queryByLabelText('Collaborateur')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-19');
    fireEvent.change(screen.getByLabelText('Durée (heures)'), { target: { value: '2,5' } });
    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'Coulage dalle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        employeId: MOI.id,
        dateHeures: '2026-10-19',
        dureeHeures: '2.50',
        majorationPct: 25,
        compensation: 'paiement',
        chantierId: null,
        motif: 'Coulage dalle',
      }),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('exige une durée', async () => {
    const onSubmit = vi.fn();
    render(
      <DemandeHeuresSupDialog
        open
        onOpenChange={vi.fn()}
        employeFixe={MOI}
        today="2026-10-19"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Durée requis.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('affiche l’erreur renvoyée par le serveur', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Vous ne pouvez déclarer des heures supplémentaires que pour vous-même.',
    });
    render(
      <DemandeHeuresSupDialog
        open
        onOpenChange={vi.fn()}
        employeFixe={MOI}
        today="2026-10-19"
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Durée (heures)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText(/que pour vous-même/)).toBeInTheDocument();
  });

  it('valideur : collaborateur à choisir (refus si vide)', async () => {
    const onSubmit = vi.fn();
    render(
      <DemandeHeuresSupDialog
        open
        onOpenChange={vi.fn()}
        employes={[MOI]}
        today="2026-10-19"
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByLabelText('Collaborateur')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Durée (heures)'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect(await screen.findByText('Employé invalide.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('BoutonDemandeHeuresSup', () => {
  it('ouvre la modale de demande', async () => {
    render(<BoutonDemandeHeuresSup employeFixe={MOI} today="2026-10-19" onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /déclarer des heures sup/i }));
    expect(await screen.findByText('Demande d’heures supplémentaires')).toBeInTheDocument();
  });
});
