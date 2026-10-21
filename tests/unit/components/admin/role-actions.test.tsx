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

import { RoleActions } from '@/components/admin/role-actions';

function rendre(overrides: Partial<Parameters<typeof RoleActions>[0]> = {}) {
  return render(
    <RoleActions
      roleId="r1"
      roleCode="conducteur"
      systeme={false}
      actif
      onDupliquer={vi.fn().mockResolvedValue({ ok: true, data: { id: 'r2' } })}
      onBasculerActif={vi.fn().mockResolvedValue({ ok: true, data: undefined })}
      onSupprimer={vi.fn().mockResolvedValue({ ok: true, data: undefined })}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RoleActions — navigation préfixée par le slug d’entreprise', () => {
  it('le lien « Modifier » pointe directement vers l’URL préfixée', () => {
    rendre();
    expect(screen.getByRole('link', { name: 'Modifier' })).toHaveAttribute(
      'href',
      '/acme/administration/roles/r1',
    );
  });

  it('« Dupliquer » ouvre le rôle copié via l’URL préfixée', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/acme/administration/roles/r2'));
  });

  it('« Dupliquer » en échec : aucune navigation', async () => {
    const onDupliquer = vi.fn().mockResolvedValue({ ok: false, error: 'Code déjà pris.' });
    rendre({ onDupliquer });
    fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
    await waitFor(() => expect(onDupliquer).toHaveBeenCalledTimes(1));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
