import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockPathname = '/acme/facturation/factures';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/hooks/navigation-guard', () => ({
  useNavigationGuard: () => ({ tryNavigate: (fn: () => void) => fn(), register: () => () => {} }),
}));

import { AppHeader } from '@/components/layout/app-header';

afterEach(() => {
  cleanup();
  mockPathname = '/acme/facturation/factures';
});

describe('AppHeader', () => {
  it('affiche le logo « B », « ERP BTP » et l’initiale de l’email', () => {
    const { getByText } = render(<AppHeader email="alex@compte-r.com" entrepriseSlug="acme" />);
    expect(getByText('B')).toBeInTheDocument();
    expect(getByText('ERP BTP')).toBeInTheDocument();
    expect(getByText('A')).toBeInTheDocument(); // initiale avatar
  });

  it('rend le fil d’Ariane à partir du pathname (slug skippé)', () => {
    const { getByText, queryByText } = render(<AppHeader email="a@b.c" entrepriseSlug="acme" />);
    expect(getByText('Facturation')).toBeInTheDocument();
    expect(getByText('Factures')).toBeInTheDocument();
    expect(queryByText('acme')).not.toBeInTheDocument();
  });

  it('skippe les segments d’identifiant', () => {
    mockPathname = '/acme/commercial/devis/11111111-2222-3333-4444-555555555555';
    const { queryByText, getByText } = render(<AppHeader email="a@b.c" entrepriseSlug="acme" />);
    expect(getByText('Devis')).toBeInTheDocument();
    expect(queryByText(/1111/)).not.toBeInTheDocument();
  });

  it('expose recherche, notifications et lien profil', () => {
    const { getByLabelText, getByRole } = render(<AppHeader email="a@b.c" entrepriseSlug="acme" />);
    expect(getByLabelText('Rechercher')).toBeInTheDocument();
    expect(getByLabelText('Notifications')).toBeInTheDocument();
    expect(getByRole('link', { name: /a@b\.c/ })).toHaveAttribute('href', '/profile');
  });
});
