import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatutDocumentPastille } from '@/components/referencement/statut-document-pastille';

describe('StatutDocumentPastille', () => {
  afterEach(() => cleanup());

  it('affiche le libellé FR du statut', () => {
    render(<StatutDocumentPastille statut="expire" />);
    expect(screen.getByText('Expiré')).toBeInTheDocument();
  });

  it('préfixe avec le libellé du document quand fourni', () => {
    render(<StatutDocumentPastille statut="manquant" libelle="K-bis" />);
    expect(screen.getByText(/K-bis · Manquant/)).toBeInTheDocument();
  });

  it('mappe chaque statut sur un ton distinct', () => {
    const { container: aJour } = render(<StatutDocumentPastille statut="a_jour" />);
    expect(aJour.firstChild).toHaveClass('bg-emerald-100');
    cleanup();
    const { container: aRenouveler } = render(<StatutDocumentPastille statut="a_renouveler" />);
    expect(aRenouveler.firstChild).toHaveClass('bg-amber-100');
    cleanup();
    const { container: expire } = render(<StatutDocumentPastille statut="expire" />);
    expect(expire.firstChild).toHaveClass('bg-rose-100');
  });
});
