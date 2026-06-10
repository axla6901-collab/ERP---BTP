import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
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

// FournisseurForm importe ImportCatalogueDialog, qui tire des server actions DB.
vi.mock('@/lib/catalogue/import-catalogue-fournisseur', () => ({
  analyserClasseurCatalogue: vi.fn(),
  previewImportCatalogue: vi.fn(),
  executerImportCatalogue: vi.fn(),
}));

import { FournisseurForm } from '@/components/tiers/fournisseur-form';

const onSubmit = vi.fn().mockResolvedValue({ ok: true });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FournisseurForm — barre d’actions', () => {
  it('affiche le titre et les actions de base (création : Annuler, Enregistrer)', () => {
    const { getByRole, getByText, queryByRole } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(getByText('Nouveau fournisseur')).toBeInTheDocument();
    expect(getByRole('button', { name: /^enregistrer$/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /annuler/i })).toBeInTheDocument();
    // Les contacts se gèrent désormais depuis la fiche (ContactsSection), plus
    // dans la barre d'actions du formulaire.
    expect(queryByRole('button', { name: /créer un contact/i })).not.toBeInTheDocument();
  });

  it('n’affiche pas les actions catalogue en création (pas d’id fournisseur)', () => {
    const { queryByRole } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(queryByRole('button', { name: /import catalogue/i })).not.toBeInTheDocument();
    expect(queryByRole('link', { name: /création catalogue/i })).not.toBeInTheDocument();
  });

  it('affiche Import catalogue et Création catalogue sur une fiche existante autorisée', () => {
    const { getByRole } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        fournisseurNom="POINT.P"
        peutImporterCatalogue
        nouvelleGrilleHref="/tiers/fournisseurs/f1/grilles/nouveau"
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(getByRole('button', { name: /import catalogue/i })).toBeInTheDocument();
    const lien = getByRole('link', { name: /création catalogue/i });
    expect(lien).toHaveAttribute('href', '/tiers/fournisseurs/f1/grilles/nouveau');
  });

  it('masque le bouton « Création catalogue » sans href (import non autorisé)', () => {
    const { queryByRole } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        fournisseurNom="POINT.P"
        peutImporterCatalogue={false}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(queryByRole('button', { name: /import catalogue/i })).not.toBeInTheDocument();
    expect(queryByRole('link', { name: /création catalogue/i })).not.toBeInTheDocument();
  });

  it('l’action Enregistrer est associée au formulaire via l’attribut form', () => {
    const { getByRole } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(getByRole('button', { name: /^enregistrer$/i })).toHaveAttribute(
      'form',
      'fournisseur-form',
    );
  });

  it('n’affiche ni badge ni toggle de statut en création (pas d’onChangerStatut)', () => {
    const { queryByRole, queryByText } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(queryByRole('button', { name: /désactiver|activer/i })).not.toBeInTheDocument();
    expect(queryByText('Actif')).not.toBeInTheDocument();
  });

  it('affiche le badge « Actif » et le bouton « Désactiver » sur une fiche active', () => {
    const { getByRole, getByText } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        defaultValues={{ actif: true }}
        onSubmit={onSubmit}
        onChangerStatut={vi.fn().mockResolvedValue({ ok: true })}
        successRedirect="/x"
      />,
    );
    expect(getByText('Actif')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
  });

  it('affiche le badge « Inactif » et le bouton « Activer » sur une fiche inactive', () => {
    const { getByRole, getByText } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        defaultValues={{ actif: false }}
        onSubmit={onSubmit}
        onChangerStatut={vi.fn().mockResolvedValue({ ok: true })}
        successRedirect="/x"
      />,
    );
    expect(getByText('Inactif')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Activer' })).toBeInTheDocument();
  });
});
