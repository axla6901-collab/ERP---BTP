import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

import { ComptesProrataListe } from '@/components/compte-prorata/comptes-prorata-liste';
import type { CompteProrataSommaire } from '@/lib/chantiers/compte-prorata-actions';

function som(p: Partial<CompteProrataSommaire> = {}): CompteProrataSommaire {
  return {
    id: 'cp1',
    chantierId: 'c1',
    chantierNumero: 'CH-2026-0001',
    chantierLibelle: 'Villa Dubois',
    statut: 'ouvert',
    nbParticipants: 3,
    totalDepensesHt: '1500.00',
    ...p,
  };
}

afterEach(() => cleanup());

describe('ComptesProrataListe', () => {
  it('rend une ligne par compte avec libellé, statut et dépenses formatées', () => {
    render(
      <ComptesProrataListe
        comptes={[
          som({ id: 'a', chantierLibelle: 'Alpha' }),
          som({ id: 'b', chantierLibelle: 'Beta', statut: 'arrete', totalDepensesHt: '2000.00' }),
        ]}
        entrepriseSlug="acme"
      />,
    );
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Ouvert')).toBeInTheDocument();
    expect(screen.getByText('Arrêté')).toBeInTheDocument();
  });

  it('affiche le message vide quand aucun compte', () => {
    render(<ComptesProrataListe comptes={[]} entrepriseSlug="acme" />);
    expect(screen.getByText(/Aucun compte prorata/i)).toBeInTheDocument();
  });
});
