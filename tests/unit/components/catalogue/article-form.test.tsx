import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// `useGuardedRouter` lève hors d'un <NavigationGuardProvider> : on stubble le module.
vi.mock('@/lib/hooks/navigation-guard', () => ({
  useGuardedRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useUnsavedChangesGuard: vi.fn(),
}));

import { ArticleForm } from '@/components/catalogue/article-form';

const familles = [{ id: 'f1', code: 'FAM', libelle: 'Famille' }];
const unites = [{ id: 'u1', code: 'M2', libelle: 'Mètre carré', symbole: 'm²' }];
const onSubmit = vi.fn().mockResolvedValue({ ok: true });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ArticleForm — barre d’actions sticky', () => {
  it('affiche le titre et les actions de base (Annuler, Enregistrer)', () => {
    const { getByRole, getByText } = render(
      <ArticleForm
        titre="Nouvel article"
        familles={familles}
        unites={unites}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(getByText('Nouvel article')).toBeInTheDocument();
    expect(getByRole('button', { name: /^enregistrer$/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /annuler/i })).toBeInTheDocument();
  });

  it('associe le bouton Enregistrer au formulaire via l’attribut form', () => {
    const { getByRole } = render(
      <ArticleForm
        titre="Nouvel article"
        familles={familles}
        unites={unites}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(getByRole('button', { name: /^enregistrer$/i })).toHaveAttribute('form', 'article-form');
  });

  it('rend les actions secondaires passées en prop dans la barre', () => {
    const { getByRole } = render(
      <ArticleForm
        titre="Modifier l'article"
        familles={familles}
        unites={unites}
        actions={<button type="button">Historique des prix</button>}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(getByRole('button', { name: /historique des prix/i })).toBeInTheDocument();
  });

  it('n’affiche pas d’actions secondaires quand la prop est absente', () => {
    const { queryByRole } = render(
      <ArticleForm
        titre="Nouvel article"
        familles={familles}
        unites={unites}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(queryByRole('button', { name: /historique des prix/i })).not.toBeInTheDocument();
  });
});

// Agencement : 4 sections en grille (1&2 / 3&4). La section « 5. Statut » a été
// supprimée et l'interrupteur « Actif » remonte dans le cadre « 1. Identification ».
describe('ArticleForm — agencement des sections', () => {
  it('rend 4 sections numérotées et plus aucune section « Statut »', () => {
    render(
      <ArticleForm
        titre="Modifier l'article"
        familles={familles}
        unites={unites}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(screen.getByRole('button', { name: /Identification/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Unités/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Caractéristiques physiques/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Description/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Statut/ })).not.toBeInTheDocument();
  });

  it('place l’interrupteur « Actif » dans la section « Identification »', () => {
    render(
      <ArticleForm
        titre="Modifier l'article"
        familles={familles}
        unites={unites}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    const section = screen.getByText('Actif').closest('[data-slot="form-section"]');
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByRole('button', { name: /Identification/ }),
    ).toBeInTheDocument();
  });
});
