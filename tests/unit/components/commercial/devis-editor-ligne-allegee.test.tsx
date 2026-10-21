import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevisEditor } from '@/components/commercial/devis-editor';
import type { DevisInput, LigneDevisInput } from '@/lib/validation/commercial';

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
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

function ligneLibre(origineDpgf = true): LigneDevisInput {
  return {
    type: 'libre',
    articleId: null,
    designation: 'Maçonnerie',
    quantite: '2',
    unite: 'm2',
    prixUnitaireHt: '10',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants: [],
    origineDpgf,
  } as LigneDevisInput;
}

function renderEditor(lignes: LigneDevisInput[]) {
  return render(
    <DevisEditor
      clients={[]}
      articles={[]}
      unites={[
        { symbole: 'm2', libelle: 'mètre carré' },
        { symbole: 'u', libelle: 'unité' },
      ]}
      defaultValues={{ lignes } as Partial<DevisInput>}
      onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      successRedirect="/commercial/devis"
      workflowStatutCourant="brouillon"
      peutGererPostesInternes={false}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Ligne de devis allégée — menu ⋮', () => {
  it('ne rend ses entrées qu’à l’ouverture, et se referme au clic extérieur', () => {
    renderEditor([ligneLibre()]);
    const menu = screen.getByTitle('Actions de la ligne');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Supprimer la ligne')).toBeNull();

    fireEvent.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Supprimer la ligne')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText('Supprimer la ligne')).toBeNull();
  });

  it('se referme après le choix d’une entrée', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderEditor([ligneLibre()]);
    fireEvent.click(screen.getByTitle('Actions de la ligne'));
    fireEvent.click(screen.getByLabelText('Supprimer la ligne'));
    expect(screen.queryByLabelText('Supprimer la ligne')).toBeNull();
  });
});

describe('Ligne de devis allégée — composants sans field array par ligne', () => {
  it('ajoute un composant depuis le menu et l’affiche', () => {
    renderEditor([ligneLibre()]);
    expect(screen.queryByLabelText('Quantité par unité de ligne')).toBeNull();

    fireEvent.click(screen.getByTitle('Actions de la ligne'));
    fireEvent.click(screen.getByLabelText('Ajouter un composant libre'));

    expect(screen.getAllByLabelText('Quantité par unité de ligne')).toHaveLength(1);
    // Le PU de la ligne devient calculé depuis les composants (lecture seule).
    expect(screen.getByLabelText('Prix unitaire HT')).toHaveAttribute('readonly');
  });

  it('cumule les ajouts puis vide les composants après confirmation', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderEditor([ligneLibre()]);

    for (const libelle of [
      'Ajouter un composant libre',
      'Ajouter un composant article catalogue',
    ]) {
      fireEvent.click(screen.getByTitle('Actions de la ligne'));
      fireEvent.click(screen.getByLabelText(libelle));
    }
    expect(screen.getAllByLabelText('Quantité par unité de ligne')).toHaveLength(2);

    fireEvent.click(screen.getByTitle('Actions de la ligne'));
    fireEvent.click(screen.getByLabelText('Vider les composants'));

    expect(screen.queryByLabelText('Quantité par unité de ligne')).toBeNull();
    expect(screen.getByLabelText('Prix unitaire HT')).not.toHaveAttribute('readonly');
  });

  it('supprime un seul composant depuis sa sous-ligne', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderEditor([ligneLibre()]);
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByTitle('Actions de la ligne'));
      fireEvent.click(screen.getByLabelText('Ajouter un composant libre'));
    }
    fireEvent.click(screen.getAllByLabelText('Supprimer ce composant')[0]!);
    expect(screen.getAllByLabelText('Quantité par unité de ligne')).toHaveLength(1);
  });
});

describe('Ligne de devis allégée — listes différées', () => {
  it('affiche unité et TVA sans monter de liste Base UI', () => {
    renderEditor([ligneLibre()]);
    expect(screen.getByRole('combobox', { name: 'Unité' })).toHaveTextContent('m2');
    expect(screen.getByRole('combobox', { name: 'Taux de TVA' })).toHaveTextContent('20.00');
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('change la TVA de la ligne via la liste montée au premier usage', async () => {
    renderEditor([ligneLibre()]);
    fireEvent.click(screen.getByRole('combobox', { name: 'Taux de TVA' }));
    const option = await screen.findByRole('option', { name: '10 %' });
    await act(async () => {
      option.focus();
      fireEvent.keyDown(option, { key: 'Enter' });
    });
    expect(screen.getByRole('combobox', { name: 'Taux de TVA' })).toHaveTextContent('10.00');
  });
});
