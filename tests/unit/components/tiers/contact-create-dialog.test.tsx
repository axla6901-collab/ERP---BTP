import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContactCreateDialog } from '@/components/tiers/contact-create-dialog';

const FOURNISSEURS = [
  { id: 'f1', nom: 'BTP Plus' },
  { id: 'f2', nom: 'POINT.P' },
];
const SOUS_TRAITANTS = [{ id: 's1', nom: 'Maçonnerie Sud' }];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ContactCreateDialog', () => {
  it('affiche le bouton déclencheur « Nouveau contact »', () => {
    render(
      <ContactCreateDialog
        fournisseurs={FOURNISSEURS}
        sousTraitants={SOUS_TRAITANTS}
        onCreer={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /nouveau contact/i })).toBeInTheDocument();
  });

  it("n'ouvre pas la modale tant qu'on ne clique pas le déclencheur", () => {
    render(
      <ContactCreateDialog
        fournisseurs={FOURNISSEURS}
        sousTraitants={SOUS_TRAITANTS}
        onCreer={vi.fn()}
      />,
    );
    expect(screen.queryByText('Rattachez le contact', { exact: false })).not.toBeInTheDocument();
  });

  it('ouvre la modale et affiche les champs (type, tiers, nom)', async () => {
    render(
      <ContactCreateDialog
        fournisseurs={FOURNISSEURS}
        sousTraitants={SOUS_TRAITANTS}
        onCreer={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /nouveau contact/i }));
    await waitFor(() => {
      expect(screen.getByText('Type de tiers')).toBeInTheDocument();
    });
    expect(screen.getByText(/Tiers de rattachement/)).toBeInTheDocument();
    expect(screen.getByText('Nom *')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /créer le contact/i })).toBeInTheDocument();
  });

  it('désactive la création et alerte quand aucun fournisseur ni sous-traitant', async () => {
    render(<ContactCreateDialog fournisseurs={[]} sousTraitants={[]} onCreer={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /nouveau contact/i }));
    await waitFor(() => {
      expect(screen.getByText(/Aucun fournisseur ni sous-traitant/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /créer le contact/i })).toBeDisabled();
  });
});
