import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/hooks/navigation-guard', () => ({
  useGuardedRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useUnsavedChangesGuard: vi.fn(),
}));

import { SousTraitantForm } from '@/components/tiers/sous-traitant-form';

const onSubmit = vi.fn().mockResolvedValue({ ok: true });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SousTraitantForm — bandeau d’actions', () => {
  it('affiche le titre et associe Enregistrer au formulaire via l’attribut form', () => {
    const { getByText, getByRole } = render(
      <SousTraitantForm titre="Nouveau sous-traitant" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(getByText('Nouveau sous-traitant')).toBeInTheDocument();
    expect(getByRole('button', { name: /^enregistrer$/i })).toHaveAttribute(
      'form',
      'sous-traitant-form',
    );
  });

  it('n’affiche ni badge ni toggle de statut en création (pas d’onChangerStatut)', () => {
    const { queryByRole, queryByText } = render(
      <SousTraitantForm titre="Nouveau sous-traitant" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(queryByRole('button', { name: /désactiver|activer/i })).not.toBeInTheDocument();
    expect(queryByText('Actif')).not.toBeInTheDocument();
  });

  it('affiche le badge « Actif » et le bouton « Désactiver » sur une fiche active', () => {
    const { getByText, getByRole } = render(
      <SousTraitantForm
        titre="Maçonnerie Sud"
        defaultValues={{ actif: true }}
        onSubmit={onSubmit}
        onChangerStatut={vi.fn().mockResolvedValue({ ok: true })}
        successRedirect="/x"
      />,
    );
    expect(getByText('Actif')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
  });

  it('expose le champ « Statut d’agrément »', () => {
    const { getByText } = render(
      <SousTraitantForm titre="Nouveau sous-traitant" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(getByText("Statut d'agrément")).toBeInTheDocument();
  });

  it('affiche le badge d’agrément « Agréé » d’après les defaultValues', () => {
    const { getAllByText } = render(
      <SousTraitantForm
        titre="Maçonnerie Sud"
        defaultValues={{ actif: true, statut: 'agree' }}
        onSubmit={onSubmit}
        onChangerStatut={vi.fn().mockResolvedValue({ ok: true })}
        successRedirect="/x"
      />,
    );
    expect(getAllByText('Agréé').length).toBeGreaterThan(0);
  });
});
