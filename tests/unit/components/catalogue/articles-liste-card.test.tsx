import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { ArticlesListeCard } from '@/components/catalogue/articles-liste-card';
import type { ArticleAvecPrix } from '@/lib/catalogue/articles';

function art(over: Partial<ArticleAvecPrix>): ArticleAvecPrix {
  return {
    id: 'a1',
    entrepriseId: 'e1',
    code: 'BTN-025',
    libelle: 'Béton C25/30',
    familleId: 'f1',
    type: 'simple',
    uniteAchatId: null,
    uniteStockId: null,
    uniteVenteId: null,
    fournisseurPrefereId: null,
    densite: null,
    epaisseur: null,
    longueurStd: null,
    largeurStd: null,
    description: null,
    actif: true,
    favori: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    familleCode: 'BET',
    familleLibelle: 'Béton',
    uniteAchatSymbole: 'm³',
    uniteStockSymbole: 'm³',
    uniteVenteSymbole: 'm³',
    prixCourant: '142.00',
    prixSource: null,
    prixMissing: false,
    prixReference: '142.00',
    prixReferenceUniteSymbole: 'm³',
    prixComposant: '142.00',
    prixComposantUniteSymbole: 'm³',
    evol30jPct: null,
    ...over,
  } as ArticleAvecPrix;
}

afterEach(() => {
  cleanup();
  push.mockReset();
});

function dataRows(): HTMLElement[] {
  return screen.getAllByRole('row').slice(1);
}

describe('ArticlesListeCard', () => {
  it('affiche le titre, le compteur et les badges de statut', () => {
    render(
      <ArticlesListeCard
        vue="table"
        onVueChange={() => {}}
        titre="Béton & granulats"
        items={[
          art({ id: 'a', type: 'compose' }),
          art({ id: 'b', actif: true }),
          art({ id: 'c', actif: false }),
        ]}
      />,
    );
    expect(screen.getByText('Béton & granulats')).toBeInTheDocument();
    expect(screen.getByText(/3 articles/)).toBeInTheDocument();
    expect(screen.getByText('composé')).toBeInTheDocument();
    expect(screen.getByText('actif')).toBeInTheDocument();
    expect(screen.getByText('archivé')).toBeInTheDocument();
  });

  it('★ favori en sous-libellé + ligne ambre', () => {
    render(
      <ArticlesListeCard
        vue="table"
        onVueChange={() => {}}
        titre="X"
        items={[art({ id: 'a', favori: true })]}
      />,
    );
    expect(screen.getByText(/★ favori/)).toBeInTheDocument();
    expect(dataRows()[0]?.className).toContain('bg-amber-50/40');
  });

  it('ligne sans prix = rose, archivé = atténué', () => {
    render(
      <ArticlesListeCard
        vue="table"
        onVueChange={() => {}}
        titre="X"
        items={[art({ id: 'a', prixMissing: true }), art({ id: 'b', actif: false })]}
      />,
    );
    const rows = dataRows();
    expect(rows[0]?.className).toContain('bg-rose-50/30');
    expect(rows[1]?.className).toContain('text-muted-foreground');
  });

  it('clic sur une ligne navigue vers le détail', () => {
    render(
      <ArticlesListeCard
        vue="table"
        onVueChange={() => {}}
        titre="X"
        items={[art({ id: 'art-1' })]}
      />,
    );
    fireEvent.click(dataRows()[0]!);
    expect(push).toHaveBeenCalledWith('/catalogue/articles/art-1');
  });

  it('le tri par prix décroissant réordonne', () => {
    render(
      <ArticlesListeCard
        vue="table"
        onVueChange={() => {}}
        titre="X"
        items={[
          art({ id: 'a', code: 'AAA', prixCourant: '10.00' }),
          art({ id: 'b', code: 'BBB', prixCourant: '99.00' }),
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Trier les articles'), {
      target: { value: 'prix-desc' },
    });
    expect(dataRows()[0]?.textContent).toContain('BBB');
  });

  it('la bascule « Grille » appelle onVueChange', () => {
    const onVueChange = vi.fn();
    render(
      <ArticlesListeCard
        vue="table"
        onVueChange={onVueChange}
        titre="X"
        items={[art({ id: 'a' })]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Grille' }));
    expect(onVueChange).toHaveBeenCalledWith('grille');
  });

  it('en vue grille, pas de tableau', () => {
    render(
      <ArticlesListeCard
        vue="grille"
        onVueChange={() => {}}
        titre="X"
        items={[art({ id: 'a', libelle: 'Alpha' })]}
      />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('pagine au-delà de 12 articles', () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      art({ id: `a${i}`, code: `A${String(i).padStart(2, '0')}` }),
    );
    render(<ArticlesListeCard vue="table" onVueChange={() => {}} titre="X" items={many} />);
    expect(screen.getByText(/1 à 12 sur 14/)).toBeInTheDocument();
    expect(dataRows()).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByText(/13 à 14 sur 14/)).toBeInTheDocument();
  });
});
