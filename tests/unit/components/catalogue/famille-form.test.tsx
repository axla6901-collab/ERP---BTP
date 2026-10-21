import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { pushMock, refreshMock } = vi.hoisted(() => ({ pushMock: vi.fn(), refreshMock: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

// `useGuardedRouter` lève hors d'un <NavigationGuardProvider> : on stubble le module.
vi.mock('@/lib/hooks/navigation-guard', () => ({
  useGuardedRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useUnsavedChangesGuard: vi.fn(),
}));

import { FamilleForm } from '@/components/catalogue/famille-form';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function soumettre(container: HTMLElement) {
  fireEvent.submit(container.querySelector('#famille-form')!);
}

describe('FamilleForm — redirection après enregistrement', () => {
  it('préfixe par le slug d’entreprise un successRedirect sans slug', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const { container } = render(
      <FamilleForm
        titre="Nouvelle famille"
        parentsDisponibles={[]}
        defaultValues={{ code: 'GO', libelle: 'Gros œuvre' }}
        onSubmit={onSubmit}
        successRedirect="/catalogue/familles"
      />,
    );

    soumettre(container);

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    expect(pushMock).toHaveBeenCalledWith('/acme/catalogue/familles');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('laisse intact un successRedirect déjà préfixé (idempotent)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    const { container } = render(
      <FamilleForm
        titre="Nouvelle famille"
        parentsDisponibles={[]}
        defaultValues={{ code: 'GO', libelle: 'Gros œuvre' }}
        onSubmit={onSubmit}
        successRedirect="/acme/catalogue/familles"
      />,
    );

    soumettre(container);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/acme/catalogue/familles'));
  });

  it('ne navigue pas si l’enregistrement échoue', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: 'Code déjà utilisé.' });
    const { container, findByText } = render(
      <FamilleForm
        titre="Nouvelle famille"
        parentsDisponibles={[]}
        defaultValues={{ code: 'GO', libelle: 'Gros œuvre' }}
        onSubmit={onSubmit}
        successRedirect="/catalogue/familles"
      />,
    );

    soumettre(container);

    expect(await findByText('Code déjà utilisé.')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });
});
