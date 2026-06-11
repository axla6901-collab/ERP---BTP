import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilterPills } from '@/components/ui/filter-pills';

afterEach(() => cleanup());

describe('FilterPills', () => {
  it('pill active = fond neutral-900', () => {
    const { getByText } = render(
      <FilterPills items={[{ key: 'all', label: 'Toutes', active: true }]} />,
    );
    expect(getByText('Toutes').closest('span, a, button')?.className).toContain('bg-neutral-900');
  });

  it('pill inactive = bordure + fond carte', () => {
    const { getByText } = render(<FilterPills items={[{ key: 'draft', label: 'Brouillon' }]} />);
    const el = getByText('Brouillon').closest('span, a, button');
    expect(el?.className).toContain('bg-card');
  });

  it('ton danger = rose', () => {
    const { getByText } = render(
      <FilterPills items={[{ key: 'late', label: 'En retard', tone: 'danger' }]} />,
    );
    expect(getByText('En retard').closest('span, a, button')?.className).toContain(
      'border-rose-200',
    );
  });

  it('affiche le compteur', () => {
    const { getByText } = render(
      <FilterPills items={[{ key: 'all', label: 'Toutes', count: 42 }]} />,
    );
    expect(getByText('42')).toBeInTheDocument();
  });

  it('onClick déclenche le callback', () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <FilterPills items={[{ key: 'all', label: 'Toutes', onClick }]} />,
    );
    fireEvent.click(getByRole('button', { name: /Toutes/ }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('href rend un lien', () => {
    const { getByRole } = render(
      <FilterPills items={[{ key: 'all', label: 'Toutes', href: '/factures?statut=all' }]} />,
    );
    expect(getByRole('link', { name: /Toutes/ })).toHaveAttribute('href', '/factures?statut=all');
  });
});
