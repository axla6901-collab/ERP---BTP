import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatutSousTraitantBadge } from '@/components/tiers/statut-sous-traitant-badge';

afterEach(cleanup);

describe('StatutSousTraitantBadge', () => {
  it('affiche le libellé FR « Agréé » en vert', () => {
    const { getByText } = render(<StatutSousTraitantBadge statut="agree" />);
    const badge = getByText('Agréé');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-emerald-100');
  });

  it('affiche « À qualifier » pour le statut initial', () => {
    const { getByText } = render(<StatutSousTraitantBadge statut="a_qualifier" />);
    expect(getByText('À qualifier')).toBeInTheDocument();
  });

  it('affiche « Refusé » en rouge', () => {
    const { getByText } = render(<StatutSousTraitantBadge statut="refuse" />);
    expect(getByText('Refusé')).toHaveClass('bg-rose-100');
  });
});
