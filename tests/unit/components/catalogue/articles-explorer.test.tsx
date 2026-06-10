import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { ArticlesExplorer } from '@/components/catalogue/articles-explorer';
import type { ArticleAvecPrix } from '@/lib/catalogue/articles';

function art(over: Partial<ArticleAvecPrix>): ArticleAvecPrix {
  return {
    id: 'a1',
    entrepriseId: 'e1',
    code: 'AAA',
    libelle: 'Alpha',
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
    familleCode: 'F1',
    familleLibelle: 'Famille Un',
    uniteAchatSymbole: 'm³',
    uniteStockSymbole: 'm³',
    uniteVenteSymbole: 'm³',
    prixCourant: '10.00',
    prixSource: null,
    prixMissing: false,
    prixReference: '10.00',
    prixReferenceUniteSymbole: 'm³',
    prixComposant: '10.00',
    prixComposantUniteSymbole: 'm³',
    evol30jPct: null,
    ...over,
  } as ArticleAvecPrix;
}

const ITEMS = [
  art({ id: 'a', code: 'AAA', libelle: 'Alpha', actif: true, familleId: 'f1', familleLibelle: 'Famille Un' }),
  art({ id: 'b', code: 'BBB', libelle: 'Beta', actif: false, familleId: 'f1', familleLibelle: 'Famille Un' }),
  art({
    id: 'c',
    code: 'CCC',
    libelle: 'Gamma',
    actif: true,
    prixMissing: true,
    familleId: 'f2',
    familleLibelle: 'Famille Deux',
  }),
];

function renderExplorer() {
  return render(
    <ArticlesExplorer
      items={ITEMS}
      chantierActif={null}
      chantiers={[]}
      articleIdsChantier={[]}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ArticlesExplorer — filtres rapides', () => {
  it('« Actifs uniquement » coché par défaut masque les inactifs', () => {
    renderExplorer();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  });

  it('décocher « Actifs uniquement » révèle les inactifs', () => {
    renderExplorer();
    fireEvent.click(screen.getByLabelText('Actifs uniquement'));
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('« Sans prix » ne garde que les articles sans prix', () => {
    renderExplorer();
    fireEvent.click(screen.getByLabelText('Sans prix'));
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });
});

describe('ArticlesExplorer — rail familles', () => {
  it('cliquer une famille filtre la liste', () => {
    renderExplorer();
    fireEvent.click(screen.getByRole('button', { name: /Famille Deux/ }));
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
  });
});

describe('ArticlesExplorer — bascule de vue', () => {
  it('passer en « Grille » retire le tableau', () => {
    renderExplorer();
    expect(screen.getByRole('table')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Grille' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // Les articles restent affichés (cartes)
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });
});
