import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';

afterEach(() => cleanup());

describe('StatutActifBadge', () => {
  it('affiche « Actif » en vert quand actif', () => {
    const { getByText } = render(<StatutActifBadge actif />);
    const badge = getByText('Actif');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-emerald-100');
  });

  it('affiche « Inactif » atténué quand inactif', () => {
    const { getByText } = render(<StatutActifBadge actif={false} />);
    const badge = getByText('Inactif');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-muted');
  });

  it('fusionne une className passée en prop', () => {
    const { getByText } = render(<StatutActifBadge actif className="ml-2" />);
    expect(getByText('Actif').className).toContain('ml-2');
  });
});
