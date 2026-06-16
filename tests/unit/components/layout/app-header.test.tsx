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

  it('n’affiche plus de fil d’Ariane (retiré du header)', () => {
    mockPathname = '/acme/facturation/factures';
    const { queryByText, queryByLabelText } = render(
      <AppHeader email="a@b.c" entrepriseSlug="acme" />,
    );
    expect(queryByLabelText("Fil d'Ariane")).not.toBeInTheDocument();
    expect(queryByText('Facturation')).not.toBeInTheDocument();
    expect(queryByText('Factures')).not.toBeInTheDocument();
  });

  it('expose recherche, notifications et lien profil', () => {
    const { getByLabelText, getByRole } = render(<AppHeader email="a@b.c" entrepriseSlug="acme" />);
    expect(getByLabelText('Rechercher')).toBeInTheDocument();
    expect(getByLabelText('Notifications')).toBeInTheDocument();
    expect(getByRole('link', { name: /a@b\.c/ })).toHaveAttribute('href', '/profile');
  });
});
