import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevisEditor } from '@/components/commercial/devis-editor';
import type { DevisInput, LigneDevisInput } from '@/lib/validation/commercial';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderEditor(lignes: LigneDevisInput[] = []) {
  return render(
    <DevisEditor
      clients={[]}
      articles={[]}
      unites={[]}
      defaultValues={{ lignes } as Partial<DevisInput>}
      onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      successRedirect="/devis"
      workflowStatutCourant="brouillon"
      peutGererPostesInternes={false}
    />,
  );
}

// Le toolbar (ajouter article / ajouter section) a été déplacé du corps de la
// section « 2. Lignes du devis » vers l'en-tête, sur la même ligne que le libellé.
describe('DevisEditor — toolbar de la section « Lignes du devis » dans l’en-tête', () => {
  afterEach(() => cleanup());

  it('rend les menus d’ajout dans l’en-tête de section', () => {
    renderEditor();
    expect(screen.getByLabelText('Ajouter article catalogue')).toBeVisible();
    expect(screen.getByLabelText('Ajouter article libre')).toBeVisible();
    expect(screen.getByLabelText('Ajouter une section')).toBeVisible();
  });

  it('garde les menus visibles quand la section est repliée (ils sont dans l’en-tête, pas dans le corps)', () => {
    renderEditor();

    const ajouterSection = screen.getByLabelText('Ajouter une section');
    const indiceCorps = screen.getByText('Le tableau défile horizontalement.');

    // Section dépliée par défaut : corps et toolbar visibles.
    expect(ajouterSection).toBeVisible();
    expect(indiceCorps).toBeVisible();

    // On replie la section via le bouton d'en-tête « 2. Lignes du devis ».
    fireEvent.click(screen.getByRole('button', { name: /Lignes du devis/ }));

    // Le corps disparaît, mais le toolbar reste accessible.
    expect(indiceCorps).not.toBeVisible();
    expect(ajouterSection).toBeVisible();
  });
});
