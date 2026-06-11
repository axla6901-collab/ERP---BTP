import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { FournisseursTable } from '@/components/tiers/fournisseurs-table';
import type { FournisseurAvecCompteurs } from '@/lib/tiers/fournisseurs';

function fournisseur(over: Partial<FournisseurAvecCompteurs> = {}): FournisseurAvecCompteurs {
  return {
    id: 'f1',
    code: 'POINTP',
    nom: 'Point P',
    ville: 'Lyon',
    siret: null,
    email: null,
    telephone: null,
    actif: true,
    contactsActifs: 0,
    contactsTotal: 0,
    ...over,
  } as unknown as FournisseurAvecCompteurs;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FournisseursTable — bascule de statut', () => {
  it('sans onChangerStatut : aucun bouton de bascule', () => {
    render(<FournisseursTable items={[fournisseur()]} peutEcrire />);
    expect(screen.queryByRole('button', { name: /désactiver|activer/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Modifier' })).toBeInTheDocument();
  });

  it('avec onChangerStatut : « Désactiver » pour un fournisseur actif', () => {
    render(
      <FournisseursTable
        items={[fournisseur({ actif: true })]}
        peutEcrire
        onChangerStatut={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
  });

  it('« Activer » pour un fournisseur inactif', () => {
    render(
      <FournisseursTable
        items={[fournisseur({ actif: false })]}
        peutEcrire
        onChangerStatut={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Activer' })).toBeInTheDocument();
  });

  it('clique sur « Désactiver » appelle onChangerStatut(id, false)', async () => {
    const onChangerStatut = vi.fn().mockResolvedValue({ ok: true });
    render(
      <FournisseursTable
        items={[fournisseur({ id: 'fx', actif: true })]}
        peutEcrire
        onChangerStatut={onChangerStatut}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(onChangerStatut).toHaveBeenCalledWith('fx', false));
  });
});
