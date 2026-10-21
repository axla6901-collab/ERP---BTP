import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockParams: Record<string, string> = {};

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

import { LienTenant } from '@/components/layout/lien-tenant';

describe('LienTenant', () => {
  beforeEach(() => {
    mockParams = { entrepriseSlug: 'acme' };
  });

  it('préfixe un href de module par le slug courant', () => {
    render(<LienTenant href="/catalogue/articles/nouveau">Nouvel article</LienTenant>);
    expect(screen.getByRole('link', { name: 'Nouvel article' })).toHaveAttribute(
      'href',
      '/acme/catalogue/articles/nouveau',
    );
  });

  it('laisse un href déjà préfixé ou hors tenant intact', () => {
    render(
      <>
        <LienTenant href="/acme/tiers">Tiers</LienTenant>
        <LienTenant href="/profile">Profil</LienTenant>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Tiers' })).toHaveAttribute('href', '/acme/tiers');
    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/profile');
  });

  it('transmet les autres props de next/link', () => {
    render(
      <LienTenant href="/rh" className="block" aria-label="Module RH">
        RH
      </LienTenant>,
    );
    const lien = screen.getByRole('link', { name: 'Module RH' });
    expect(lien).toHaveClass('block');
    expect(lien).toHaveAttribute('href', '/acme/rh');
  });
});
