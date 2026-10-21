import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmployeForm } from '@/components/rh/employe-form';
import { useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
// `useGuardedRouter` lève hors d'un <NavigationGuardProvider> : on stubbe le module.
vi.mock('@/lib/hooks/navigation-guard', () => ({
  useGuardedRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useUnsavedChangesGuard: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function dernierIsDirty(): boolean | undefined {
  return vi.mocked(useUnsavedChangesGuard).mock.calls.at(-1)?.[0].isDirty;
}

describe('EmployeForm — après enregistrement', () => {
  it('n’est plus « modifié » une fois la fiche enregistrée (pas de fausse alerte de sortie)', async () => {
    const soumettre = vi.fn().mockResolvedValue({ ok: true, data: { id: 'e1' } });
    const { container, getByDisplayValue } = render(
      <EmployeForm
        defaultValues={{ nom: 'DUPONT', prenom: 'Jean' }}
        onSubmit={soumettre}
        successRedirect="/rh/employes/e1"
      />,
    );

    fireEvent.change(getByDisplayValue('Jean'), { target: { value: 'Jeanne' } });
    await waitFor(() => expect(dernierIsDirty()).toBe(true));

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(soumettre).toHaveBeenCalledTimes(1));
    expect(soumettre).toHaveBeenCalledWith(expect.objectContaining({ prenom: 'Jeanne' }));
    await waitFor(() => expect(dernierIsDirty()).toBe(false));
  });
});
