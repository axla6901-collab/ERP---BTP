import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ListLayout } from '@/components/ui/list-layout';

afterEach(() => cleanup());

describe('ListLayout', () => {
  it('rend le rail (aside) et la zone principale (section)', () => {
    const { getByText, container } = render(
      <ListLayout aside={<div>Filtres</div>}>
        <div>Liste</div>
      </ListLayout>,
    );
    expect(getByText('Filtres')).toBeInTheDocument();
    expect(getByText('Liste')).toBeInTheDocument();
    expect(container.querySelector('aside')?.className).toContain('lg:w-72');
    expect(container.querySelector('section')?.className).toContain('flex-1');
  });
});
