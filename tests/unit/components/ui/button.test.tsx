import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from '@/components/ui/button';

afterEach(() => cleanup());

describe('Button', () => {
  it('variante par défaut = primaire (amber via token)', () => {
    const { getByRole } = render(<Button>OK</Button>);
    expect(getByRole('button').className).toContain('bg-primary');
  });

  it('variante dark = bg-neutral-900', () => {
    const { getByRole } = render(<Button variant="dark">Action</Button>);
    expect(getByRole('button').className).toContain('bg-neutral-900');
  });

  it('variante destructive = outline rose', () => {
    const { getByRole } = render(<Button variant="destructive">Supprimer</Button>);
    const cls = getByRole('button').className;
    expect(cls).toContain('border-rose-200');
    expect(cls).toContain('text-rose-600');
  });

  it('variante destructive-solid = rose plein', () => {
    const { getByRole } = render(<Button variant="destructive-solid">Relancer</Button>);
    expect(getByRole('button').className).toContain('bg-rose-500');
  });

  it('variante outline = fond carte', () => {
    const { getByRole } = render(<Button variant="outline">Filtre</Button>);
    expect(getByRole('button').className).toContain('bg-card');
  });

  it('taille sm = h-7', () => {
    const { getByRole } = render(<Button size="sm">x</Button>);
    expect(getByRole('button').className).toContain('h-7');
  });

  it('disabled empêche le clic', () => {
    const { getByRole } = render(<Button disabled>x</Button>);
    expect(getByRole('button')).toBeDisabled();
  });
});
