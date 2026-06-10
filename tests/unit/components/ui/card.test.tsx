import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

afterEach(() => cleanup());

describe('Card', () => {
  it('Card a une bordure et une ombre (plus de ring)', () => {
    const { getByText } = render(<Card>contenu</Card>);
    const card = getByText('contenu');
    expect(card.className).toContain('border');
    expect(card.className).toContain('shadow-sm');
    expect(card.className).not.toContain('ring-1');
  });

  it('CardTitle est en font-semibold', () => {
    const { getByText } = render(<CardTitle>Titre</CardTitle>);
    expect(getByText('Titre').className).toContain('font-semibold');
  });

  it('CardFooter n’a plus de fond gris', () => {
    const { getByText } = render(<CardFooter>pied</CardFooter>);
    const footer = getByText('pied');
    expect(footer.className).toContain('border-t');
    expect(footer.className).not.toContain('bg-muted/50');
  });

  it('CardHeader accepte une className border-b', () => {
    const { getByText } = render(<CardHeader className="border-b">h</CardHeader>);
    expect(getByText('h').className).toContain('border-b');
  });
});
