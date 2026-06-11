import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DevisTable } from '@/components/commercial/devis-table';
import type { DevisAvecClient } from '@/lib/commercial/devis';

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

const ITEM: DevisAvecClient = {
  id: 'devis-1',
  numero: 'DEV-2026-00001',
  statut: 'brouillon',
  dateDevis: '2026-05-26',
  dateValidite: '2026-06-25',
  objet: 'Rénovation cuisine',
  conditionsGenerales: null,
  notes: null,
  clientId: 'c-1',
  totalHt: '1000.00',
  totalTva: '200.00',
  totalTtc: '1200.00',
  chantierId: null,
  clientCode: 'C001',
  clientNom: 'Dupont',
} as unknown as DevisAvecClient;

describe('DevisTable — bouton Dupliquer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it("absent quand dupliquerAction n'est pas fourni", () => {
    render(<DevisTable items={[ITEM]} peutEcrire={true} />);
    expect(
      screen.queryByRole('button', { name: /Dupliquer DEV-2026-00001/ }),
    ).not.toBeInTheDocument();
  });

  it('absent en lecture seule même si dupliquerAction est fourni', () => {
    render(<DevisTable items={[ITEM]} peutEcrire={false} dupliquerAction={vi.fn()} />);
    expect(
      screen.queryByRole('button', { name: /Dupliquer DEV-2026-00001/ }),
    ).not.toBeInTheDocument();
  });

  it('présent quand peutEcrire + dupliquerAction fournis', () => {
    render(<DevisTable items={[ITEM]} peutEcrire={true} dupliquerAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Dupliquer DEV-2026-00001/ })).toBeInTheDocument();
  });

  it('clic ouvre le dialog DupliquerDevisDialog', () => {
    render(
      <DevisTable
        items={[ITEM]}
        peutEcrire={true}
        peutVersionner={true}
        dupliquerAction={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Dupliquer DEV-2026-00001/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Dupliquer le devis')).toBeInTheDocument();
  });
});
