import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilterRailItem, FilterRailSection } from '@/components/ui/filter-rail-section';

afterEach(() => cleanup());

describe('FilterRailSection', () => {
  it('affiche le titre, l’action et le contenu', () => {
    const { getByText } = render(
      <FilterRailSection title="Familles" action={<button>Tout voir</button>}>
        <div>contenu</div>
      </FilterRailSection>,
    );
    expect(getByText('Familles')).toBeInTheDocument();
    expect(getByText('Tout voir')).toBeInTheDocument();
    expect(getByText('contenu')).toBeInTheDocument();
  });
});

describe('FilterRailItem', () => {
  it('actif = fond ambre + compteur affiché', () => {
    const { getByRole, getByText } = render(
      <FilterRailItem label="Maçonnerie" count={34} active onClick={() => {}} />,
    );
    expect(getByRole('button', { name: /Maçonnerie/ }).className).toContain('bg-amber-50');
    expect(getByText('34')).toBeInTheDocument();
  });

  it('onClick déclenche le callback (bouton, aria-pressed)', () => {
    const onClick = vi.fn();
    const { getByRole } = render(<FilterRailItem label="Couverture" onClick={onClick} />);
    const btn = getByRole('button', { name: /Couverture/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('href rend un lien', () => {
    const { getByRole } = render(
      <FilterRailItem label="Béton" href="/catalogue/articles?famille=beton" />,
    );
    expect(getByRole('link', { name: /Béton/ })).toHaveAttribute(
      'href',
      '/catalogue/articles?famille=beton',
    );
  });
});
