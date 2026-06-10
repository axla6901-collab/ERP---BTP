import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatCard, StatGrid } from '@/components/ui/stat-card';

afterEach(() => cleanup());

describe('StatCard', () => {
  it('affiche label, valeur et indice', () => {
    const { getByText } = render(
      <StatCard label="CA facturé" value="87 420 €" hint="42 factures" />,
    );
    expect(getByText('CA facturé')).toBeInTheDocument();
    expect(getByText('87 420 €')).toBeInTheDocument();
    expect(getByText('42 factures')).toBeInTheDocument();
  });

  it('sans indice : pas de bloc hint (label + valeur seulement)', () => {
    const { container } = render(<StatCard label="X" value="1" />);
    const card = container.querySelector('[data-slot="stat-card"]');
    expect(card?.children).toHaveLength(2);
  });

  it('ton rose : conteneur bordé rose et valeur rose', () => {
    const { getByText } = render(<StatCard label="En retard" value="18 240 €" tone="rose" />);
    expect(getByText('18 240 €').closest('[data-slot="stat-card"]')?.className).toContain(
      'border-rose-200',
    );
    expect(getByText('18 240 €').className).toContain('text-rose-700');
  });

  it('ton emerald : valeur en emerald', () => {
    const { getByText } = render(<StatCard label="Encaissé" value="69 180 €" tone="emerald" />);
    expect(getByText('69 180 €').className).toContain('text-emerald-700');
  });
});

describe('StatGrid', () => {
  it('grille responsive 2 → 4 colonnes', () => {
    const { container } = render(
      <StatGrid>
        <StatCard label="A" value="1" />
      </StatGrid>,
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid).toHaveClass('grid-cols-2');
    expect(grid.className).toContain('sm:grid-cols-4');
  });
});
