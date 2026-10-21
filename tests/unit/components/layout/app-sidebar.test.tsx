import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let mockPathname = '/acme/commercial/clients';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/lib/hooks/navigation-guard', () => ({
  useNavigationGuard: () => ({ tryNavigate: (fn: () => void) => fn(), register: () => () => {} }),
}));

// Isole la sidebar de ses enfants lourds (auth client / Select base-ui).
vi.mock('@/components/layout/entreprise-switcher', () => ({
  EntrepriseSwitcher: () => <div data-testid="switcher" />,
}));
vi.mock('@/components/auth/sign-out-button', () => ({
  SignOutButton: () => <button type="button">Se déconnecter</button>,
}));

import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';

const baseProps = {
  email: 'a@b.c',
  role: 'admin' as const,
  entrepriseSlug: 'acme',
  entrepriseRaisonSociale: 'ACME',
  entreprises: [],
};

/** La sidebar consomme `useSidebar()` : on l'enveloppe dans son provider. */
function renderSidebar(props: Partial<React.ComponentProps<typeof AppSidebar>> = {}) {
  return render(
    <SidebarProvider>
      <AppSidebar {...baseProps} {...props} />
    </SidebarProvider>,
  );
}

afterEach(() => {
  cleanup();
  mockPathname = '/acme/commercial/clients';
});

describe('AppSidebar', () => {
  it('état actif orange prononcé sur la section courante', () => {
    const { getByRole } = renderSidebar();
    const lien = getByRole('link', { name: 'Commercial' });
    // Le conteneur stylé est le parent du lien.
    const conteneur = lien.parentElement as HTMLElement;
    expect(conteneur.className).toContain('bg-orange-500');
    expect(conteneur.className).toContain('text-white');
  });

  it('masque les entrées super-admin si isSuperAdmin=false', () => {
    const { queryByRole } = renderSidebar({ isSuperAdmin: false });
    expect(queryByRole('link', { name: 'Entreprises' })).not.toBeInTheDocument();
    expect(queryByRole('link', { name: 'MCD' })).not.toBeInTheDocument();
  });

  it('masque Administration pour un rôle non autorisé', () => {
    const { queryByRole } = renderSidebar({ role: 'ouvrier' });
    expect(queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
  });

  it('masque Planning si le feature flag est absent, l’affiche sinon', () => {
    const sansFlag = renderSidebar();
    expect(sansFlag.queryByRole('link', { name: 'Planning' })).not.toBeInTheDocument();
    cleanup();
    const avecFlag = renderSidebar({ features: { planning: true } });
    expect(avecFlag.getByRole('link', { name: 'Planning' })).toBeInTheDocument();
  });

  it('masque Test SIRH sans le feature flag, l’affiche avec', () => {
    const sansFlag = renderSidebar();
    expect(sansFlag.queryByRole('link', { name: 'Test SIRH' })).not.toBeInTheDocument();
    cleanup();
    const avecFlag = renderSidebar({ features: { 'test-sirh': true } });
    expect(avecFlag.getByRole('link', { name: 'Test SIRH' })).toBeInTheDocument();
  });

  it('Test SIRH : filtre les sous-menus selon le rôle (ouvrier = libre-service)', () => {
    mockPathname = '/acme/test-sirh/mon-espace';
    const ouvrier = renderSidebar({ role: 'ouvrier', features: { 'test-sirh': true } });
    expect(ouvrier.getByRole('link', { name: 'Mon espace' })).toBeInTheDocument();
    expect(ouvrier.getByRole('link', { name: 'Annonces' })).toBeInTheDocument();
    expect(ouvrier.queryByRole('link', { name: 'Collaborateurs' })).not.toBeInTheDocument();
    expect(ouvrier.queryByRole('link', { name: 'Paie' })).not.toBeInTheDocument();
    expect(ouvrier.queryByRole('link', { name: 'Validations' })).not.toBeInTheDocument();
    cleanup();

    const comptable = renderSidebar({ role: 'comptable', features: { 'test-sirh': true } });
    expect(comptable.getByRole('link', { name: 'Paie' })).toBeInTheDocument();
    expect(comptable.getByRole('link', { name: 'Collaborateurs' })).toBeInTheDocument();
    expect(comptable.queryByRole('link', { name: 'Validations' })).not.toBeInTheDocument();
  });

  it('Tiers et Facturation pointent directement vers leur page d’atterrissage (pas de redirection)', () => {
    const { getByRole } = renderSidebar();
    expect(getByRole('link', { name: 'Tiers' })).toHaveAttribute(
      'href',
      '/acme/tiers/fournisseurs',
    );
    expect(getByRole('link', { name: 'Facturation' })).toHaveAttribute(
      'href',
      '/acme/facturation/factures',
    );
  });

  it('la section Tiers reste active sur une autre de ses pages', () => {
    mockPathname = '/acme/tiers/sous-traitants';
    const { getByRole } = renderSidebar();
    const conteneur = getByRole('link', { name: 'Tiers' }).parentElement as HTMLElement;
    expect(conteneur.className).toContain('bg-orange-500');
  });

  it('expose un bouton de repli du menu (desktop)', () => {
    const { getByRole } = renderSidebar();
    expect(getByRole('button', { name: /Réduire le menu|Déployer le menu/ })).toBeInTheDocument();
  });
});
