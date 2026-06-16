import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TotauxDevis } from '@/components/commercial/totaux-devis';
import type { LigneDevisInput } from '@/lib/validation/commercial';

afterEach(cleanup);

function ligne(partial: Partial<LigneDevisInput> = {}): LigneDevisInput {
  return {
    type: 'libre',
    articleId: null,
    designation: 'Prestation',
    quantite: '10',
    unite: 'u',
    prixUnitaireHt: '100',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants: [],
    origineDpgf: false,
    ...partial,
  } as LigneDevisInput;
}

describe('TotauxDevis — carte récap ambre (rail)', () => {
  it('affiche le titre Récapitulatif et le Total TTC', () => {
    render(<TotauxDevis lignes={[ligne()]} />);
    expect(screen.getByText('Récapitulatif')).toBeInTheDocument();
    expect(screen.getByText('Total TTC')).toBeInTheDocument();
    // 10 x 100 = 1000 HT, TTC = 1200 (TVA 20 %). Le separateur de milliers
    // fr-FR est une espace fine insecable -> on matche avec \s (souple).
    expect(screen.getByText(/1\s?200,00\s?€/)).toBeInTheDocument();
  });

  it('detaille la TVA par taux avec sa base', () => {
    render(<TotauxDevis lignes={[ligne()]} />);
    expect(screen.getByText(/TVA 20 % sur/)).toBeInTheDocument();
    expect(screen.getByText('Total TVA')).toBeInTheDocument();
  });

  it('affiche la remise globale ventilee quand fournie', () => {
    render(<TotauxDevis lignes={[ligne()]} remiseGlobale={{ type: 'pourcent', valeur: '10' }} />);
    expect(screen.getByText(/Total HT brut/)).toBeInTheDocument();
    expect(screen.getByText('Total HT net')).toBeInTheDocument();
    // Remise de 10 % sur 1000 HT = 100 EUR.
    expect(screen.getByText(/100,00\s?€/)).toBeInTheDocument();
  });

  it('signale les montants client (all-in) en presence de postes internes', () => {
    render(
      <TotauxDevis
        lignes={[ligne()]}
        postesInternes={[
          {
            portee: 'devis',
            chapitreOrdre: null,
            libelle: 'Aleas',
            montantHt: '50',
            notes: null,
            repartitions: [],
          },
        ]}
      />,
    );
    expect(screen.getByText(/montants client \(all-in\)/)).toBeInTheDocument();
    expect(screen.getByText(/Postes internes ventilés/)).toBeInTheDocument();
  });
});
