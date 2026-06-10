import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// vi.mock est hoisté en haut du fichier : on passe par vi.hoisted pour partager
// des mocks stables référençables dans les factories ET les assertions.
const { refresh, toast } = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh }),
}));
vi.mock('sonner', () => ({ toast }));

import { StatutToggleButton } from '@/components/tiers/statut-toggle-button';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StatutToggleButton', () => {
  it('propose « Désactiver » quand l’entité est active', () => {
    render(<StatutToggleButton actif action={vi.fn().mockResolvedValue({ ok: true })} />);
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
  });

  it('propose « Activer » quand l’entité est inactive', () => {
    render(
      <StatutToggleButton actif={false} action={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    expect(screen.getByRole('button', { name: 'Activer' })).toBeInTheDocument();
  });

  it('appelle l’action avec l’état cible (false) puis rafraîchit et notifie', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(
      <StatutToggleButton actif libelle="Fournisseur" action={action} onDone={onDone} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith(false));
    expect(onDone).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith('Fournisseur désactivé');
    expect(refresh).toHaveBeenCalled();
  });

  it('réactive avec l’état cible (true)', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<StatutToggleButton actif={false} libelle="Contact" action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }));

    await waitFor(() => expect(action).toHaveBeenCalledWith(true));
    expect(toast.success).toHaveBeenCalledWith('Contact réactivé');
  });

  it('affiche un toast d’erreur et ne rafraîchit pas si l’action échoue', async () => {
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'Boom' });
    render(<StatutToggleButton actif action={action} />);
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Boom'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
