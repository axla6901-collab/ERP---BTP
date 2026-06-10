import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented-control';

afterEach(() => cleanup());

const OPTIONS: SegmentedOption<string>[] = [
  { value: 'table', label: 'Tableau' },
  { value: 'grid', label: 'Grille' },
];

describe('SegmentedControl', () => {
  it('rend un groupe avec aria-label', () => {
    const { getByRole } = render(
      <SegmentedControl options={OPTIONS} value="table" onChange={() => {}} aria-label="Vue" />,
    );
    expect(getByRole('group', { name: 'Vue' })).toBeInTheDocument();
  });

  it('le segment actif a aria-pressed=true, les autres false', () => {
    const { getByRole } = render(
      <SegmentedControl options={OPTIONS} value="table" onChange={() => {}} />,
    );
    expect(getByRole('button', { name: 'Tableau' })).toHaveAttribute('aria-pressed', 'true');
    expect(getByRole('button', { name: 'Grille' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clic sur un segment appelle onChange avec sa valeur', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <SegmentedControl options={OPTIONS} value="table" onChange={onChange} />,
    );
    fireEvent.click(getByRole('button', { name: 'Grille' }));
    expect(onChange).toHaveBeenCalledWith('grid');
  });

  it('le segment actif a le fond surélevé', () => {
    const { getByRole } = render(
      <SegmentedControl options={OPTIONS} value="table" onChange={() => {}} />,
    );
    expect(getByRole('button', { name: 'Tableau' }).className).toContain('bg-background');
  });
});
