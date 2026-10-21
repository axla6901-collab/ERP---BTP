import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FacturesTable } from '@/components/facturation/factures-table';
import type { FactureAvecClient } from '@/lib/facturation/factures';

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'default' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/default/facturation/factures',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

function facture(id: string, numero: string | null, statut: string): FactureAvecClient {
  return {
    id,
    numero,
    statut,
    dateFacture: '2026-10-20',
    dateEcheance: null,
    totalHt: '100.00',
    totalTva: '20.00',
    totalTtc: '120.00',
    clientCode: 'CLI',
    clientNom: 'Client test',
  } as unknown as FactureAvecClient;
}

describe('FacturesTable — numéro de facture', () => {
  it('affiche le numéro des factures émises et « Brouillon » pour un brouillon non numéroté', () => {
    render(
      <FacturesTable
        items={[facture('f1', 'F-2026-000001', 'emise'), facture('f2', null, 'brouillon')]}
        peutEcrire
      />,
    );

    expect(screen.getByText('F-2026-000001')).toBeInTheDocument();
    // « Brouillon » apparaît aussi dans le filtre et le badge de statut.
    expect(screen.getAllByText('Brouillon').some((el) => el.className.includes('italic'))).toBe(
      true,
    );
  });
});
