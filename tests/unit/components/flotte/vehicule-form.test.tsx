import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VehiculeForm } from '@/components/flotte/vehicule-form';
import { useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/hooks/navigation-guard', () => ({
  useGuardedRouter: () => ({ back: vi.fn() }),
  useUnsavedChangesGuard: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'v1' } });

describe('VehiculeForm', () => {
  it('rend le titre, le lien retour et le bouton Enregistrer lié au formulaire', () => {
    const { getByText, getByRole } = render(
      <VehiculeForm
        titre="Nouveau véhicule"
        backHref="/acme/flotte/vehicules"
        backLabel="Véhicules"
        employes={[{ id: 'e1', nom: 'Marc Dubois' }]}
        onSubmit={onSubmit}
        successRedirect="/acme/flotte/vehicules"
      />,
    );
    expect(getByText('Nouveau véhicule')).toBeInTheDocument();
    expect(getByRole('link', { name: /Véhicules/ })).toHaveAttribute(
      'href',
      '/acme/flotte/vehicules',
    );
    const enregistrer = getByRole('button', { name: /enregistrer/i });
    expect(enregistrer).toHaveAttribute('form', 'vehicule-form');
  });

  it('affiche le sous-titre (immatriculation / catégorie) en édition', () => {
    const { getByText } = render(
      <VehiculeForm
        titre="Renault Master"
        sousTitre="AA-123-BB · Utilitaire · Diesel"
        employes={[]}
        defaultValues={{
          id: 'v1',
          immatriculation: 'AA-123-BB',
          marque: 'Renault',
          modele: 'Master',
        }}
        onSubmit={onSubmit}
        successRedirect="/acme/flotte/vehicules/v1"
      />,
    );
    expect(getByText('AA-123-BB · Utilitaire · Diesel')).toBeInTheDocument();
  });

  it('n’est plus « modifié » après un enregistrement réussi (pas de fausse alerte de sortie)', async () => {
    const dernierIsDirty = () => vi.mocked(useUnsavedChangesGuard).mock.calls.at(-1)?.[0].isDirty;
    const soumettre = vi.fn().mockResolvedValue({ ok: true, data: { id: 'v1' } });
    const { container, getByDisplayValue } = render(
      <VehiculeForm
        titre="Renault Master"
        employes={[]}
        defaultValues={{
          id: '33333333-3333-4333-8333-333333333333',
          immatriculation: 'AA-123-BB',
          marque: 'Renault',
          modele: 'Master',
        }}
        onSubmit={soumettre}
        successRedirect="/acme/flotte/vehicules/v1"
      />,
    );

    fireEvent.change(getByDisplayValue('Master'), { target: { value: 'Master III' } });
    await waitFor(() => expect(dernierIsDirty()).toBe(true));

    fireEvent.submit(container.querySelector('#vehicule-form')!);

    await waitFor(() => expect(soumettre).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dernierIsDirty()).toBe(false));
  });
});
