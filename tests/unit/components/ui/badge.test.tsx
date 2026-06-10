import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge } from '@/components/ui/badge';

afterEach(() => cleanup());

describe('Badge', () => {
  it('rend le texte enfant', () => {
    const { getByText } = render(<Badge>en cours</Badge>);
    expect(getByText('en cours')).toBeInTheDocument();
  });

  it('applique la classe du ton', () => {
    const cas: Array<[Parameters<typeof Badge>[0]['tone'], string]> = [
      ['amber', 'bg-amber-100'],
      ['emerald', 'bg-emerald-100'],
      ['rose', 'bg-rose-100'],
      ['sky', 'bg-sky-100'],
      ['violet', 'bg-violet-100'],
      ['neutral', 'bg-neutral-100'],
    ];
    for (const [tone, cls] of cas) {
      const { getByText } = render(<Badge tone={tone}>x</Badge>);
      expect(getByText('x').className).toContain(cls);
      cleanup();
    }
  });

  it('shape pill → rounded-full, défaut → rounded', () => {
    const { getByText: byPill } = render(<Badge shape="pill">p</Badge>);
    expect(byPill('p').className).toContain('rounded-full');
    cleanup();
    const { getByText: byDefault } = render(<Badge>d</Badge>);
    expect(byDefault('d').className).toContain('rounded');
    expect(byDefault('d').className).not.toContain('rounded-full');
  });

  it('fusionne la className passée', () => {
    const { getByText } = render(<Badge className="ml-2">y</Badge>);
    expect(getByText('y').className).toContain('ml-2');
  });
});
