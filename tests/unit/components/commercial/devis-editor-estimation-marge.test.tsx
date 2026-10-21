import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, within } from '@testing-library/react';
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

afterEach(cleanup);

const ARTICLE_ID = '22222222-2222-4222-8222-222222222222';

// Article catalogue : prix de revient (prixCourant) 1,85 € l'unité.
const ARTICLE = {
  id: ARTICLE_ID,
  code: 'PARP',
  libelle: 'Parpaing 20x20x50',
  uniteVenteSymbole: 'u',
  prixCourant: '1.85',
};

// Vente : 2 × 45 (ligne libre, sans coût) + 100 × 2,50 (article) = 340 € HT brut.
// Coût estimé (lignes catalogue) : 100 × 1,85 = 185 €.
const LIGNES = [
  {
    type: 'libre',
    articleId: null,
    designation: "Main d'œuvre pose",
    quantite: '2',
    unite: 'u',
    prixUnitaireHt: '45',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants: [],
    origineDpgf: false,
  },
  {
    type: 'article_catalogue',
    articleId: ARTICLE_ID,
    designation: 'Parpaing 20x20x50',
    quantite: '100',
    unite: 'u',
    prixUnitaireHt: '2.50',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants: [],
    origineDpgf: false,
  },
] as LigneDevisInput[];

function renderEditor(defaultValues: Partial<DevisInput>) {
  return render(
    <DevisEditor
      clients={[]}
      articles={[ARTICLE]}
      unites={[]}
      defaultValues={defaultValues}
      onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      successRedirect="/devis"
      workflowStatutCourant="brouillon"
      peutGererPostesInternes={false}
    />,
  );
}

/** Valeur affichée en face du libellé dans la carte « Estimation marge ». */
function valeurMarge(libelle: string): string {
  const carte = screen.getByText('Estimation marge').closest('section') as HTMLElement;
  return within(carte).getByText(libelle).nextElementSibling?.textContent ?? '';
}

describe('DevisEditor — carte « Estimation marge »', () => {
  it('sans remise globale : vente = total HT des lignes', () => {
    renderEditor({ lignes: LIGNES });

    expect(valeurMarge('Vente HT')).toBe('340,00 €');
    expect(valeurMarge('Coût estimé')).toBe('185,00 €');
    // (340 − 185) / 340 = 45,6 %
    expect(valeurMarge('Marge')).toBe('45,6 %');
  });

  it('avec une remise globale en % : la marge est calculée sur le HT net', () => {
    renderEditor({ lignes: LIGNES, remiseGlobaleType: 'pourcent', remiseGlobaleValeur: '5' });

    // 340 − 5 % = 323 € HT net ; (323 − 185) / 323 = 42,7 %
    expect(valeurMarge('Vente HT')).toBe('323,00 €');
    expect(valeurMarge('Marge')).toBe('42,7 %');
  });

  it('avec une remise globale en montant : la marge est calculée sur le HT net', () => {
    renderEditor({ lignes: LIGNES, remiseGlobaleType: 'montant', remiseGlobaleValeur: '40' });

    // 340 − 40 = 300 € HT net ; (300 − 185) / 300 = 38,3 %
    expect(valeurMarge('Vente HT')).toBe('300,00 €');
    expect(valeurMarge('Marge')).toBe('38,3 %');
  });
});
