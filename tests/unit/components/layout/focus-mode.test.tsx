import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/commercial/devis/devis-1',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/hooks/navigation-guard', () => ({
  useNavigationGuard: () => ({ tryNavigate: (fn: () => void) => fn(), register: () => () => {} }),
}));

vi.mock('@/components/layout/entreprise-switcher', () => ({
  EntrepriseSwitcher: () => <div data-testid="switcher" />,
}));
vi.mock('@/components/auth/sign-out-button', () => ({
  SignOutButton: () => <button type="button">Se déconnecter</button>,
}));

import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider, useSidebar } from '@/components/layout/sidebar-context';

function Toggler() {
  const { setFocusMode } = useSidebar();
  return (
    <button type="button" onClick={() => setFocusMode(true)}>
      go-focus
    </button>
  );
}

const sidebarProps = {
  email: 'a@b.c',
  role: 'admin' as const,
  entrepriseSlug: 'acme',
  entrepriseRaisonSociale: 'ACME',
  entreprises: [],
};

afterEach(cleanup);

describe('Mode plein écran (focusMode) — chrome de l’app', () => {
  it('masque la sidebar et le header quand focusMode passe à true', () => {
    render(
      <SidebarProvider>
        <Toggler />
        <AppHeader email="a@b.c" entrepriseSlug="acme" />
        <AppSidebar {...sidebarProps} />
      </SidebarProvider>,
    );

    // Avant : header (recherche) + sidebar (burger mobile) présents. On évite
    // « Commercial » (présent à la fois dans le fil d'Ariane du header et la
    // nav de la sidebar) au profit de libellés uniques à chaque zone.
    expect(screen.getByLabelText('Rechercher')).toBeInTheDocument();
    expect(screen.getByLabelText('Ouvrir le menu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'go-focus' }));

    // Après : header et sidebar démontés.
    expect(screen.queryByLabelText('Rechercher')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ouvrir le menu')).not.toBeInTheDocument();
  });
});
