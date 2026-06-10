import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

// Le composant importe les server actions du module lib (qui tire la DB) —
// on le stubble entièrement, on ne teste ici que le rendu / l'UX du dialog.
vi.mock('@/lib/catalogue/import-catalogue-fournisseur', () => ({
  analyserClasseurCatalogue: vi.fn(),
  previewImportCatalogue: vi.fn(),
  executerImportCatalogue: vi.fn(),
}));

import {
  ImportCatalogueDialog,
  type ImportCatalogueDialogHandle,
} from '@/components/catalogue/import-catalogue-dialog';

describe('ImportCatalogueDialog', () => {
  afterEach(() => cleanup());

  it('affiche le bouton déclencheur et un input file caché au repos', () => {
    const { container, getByRole } = render(
      <ImportCatalogueDialog fournisseurId="f1" fournisseurNom="POINT.P" />,
    );
    expect(getByRole('button', { name: /importer un catalogue/i })).toBeInTheDocument();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.accept).toContain('.xlsx');
  });

  it('clique sur le bouton déclenche l’ouverture du sélecteur de fichier', () => {
    const { container, getByRole } = render(
      <ImportCatalogueDialog fournisseurId="f1" fournisseurNom="POINT.P" />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    fireEvent.click(getByRole('button', { name: /importer un catalogue/i }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('masque le bouton déclencheur interne quand hideTrigger est posé', () => {
    const { container, queryByRole } = render(
      <ImportCatalogueDialog fournisseurId="f1" fournisseurNom="POINT.P" hideTrigger />,
    );
    expect(queryByRole('button', { name: /importer un catalogue/i })).not.toBeInTheDocument();
    // L'input file reste monté pour pouvoir être déclenché via la ref.
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('ouvrir() exposé via la ref déclenche le sélecteur de fichier', () => {
    const ref = createRef<ImportCatalogueDialogHandle>();
    const { container } = render(
      <ImportCatalogueDialog
        ref={ref}
        fournisseurId="f1"
        fournisseurNom="POINT.P"
        hideTrigger
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    act(() => ref.current?.ouvrir());
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
