import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageToolbar } from '@/components/layout/page-toolbar';

afterEach(() => cleanup());

describe('PageToolbar', () => {
  it('rend titre, sous-titre, actions et children', () => {
    const { getByText } = render(
      <PageToolbar
        title="Factures"
        subtitle="42 factures"
        actions={<button type="button">+ Nouvelle</button>}
      >
        <span>centre</span>
      </PageToolbar>,
    );
    expect(getByText('Factures')).toBeInTheDocument();
    expect(getByText('42 factures')).toBeInTheDocument();
    expect(getByText('+ Nouvelle')).toBeInTheDocument();
    expect(getByText('centre')).toBeInTheDocument();
  });

  it('est sticky sous le header (top-14) et pleine largeur', () => {
    const { container } = render(<PageToolbar title="X" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('sticky');
    expect(root.className).toContain('top-14');
    expect(root.className).toContain('-mx-4');
    expect(root.className).toContain('lg:-mx-8');
  });
});
