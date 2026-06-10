import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TabsNav, TabsTrigger, tabsTriggerClasses } from '@/components/ui/tabs';

afterEach(() => cleanup());

describe('Tabs', () => {
  it('onglet actif → souligné amber', () => {
    const cls = tabsTriggerClasses(true);
    expect(cls).toContain('border-amber-500');
    expect(cls).toContain('text-amber-700');
    expect(cls).toContain('font-medium');
  });

  it('onglet inactif → transparent / muted', () => {
    const cls = tabsTriggerClasses(false);
    expect(cls).toContain('border-transparent');
    expect(cls).toContain('text-muted-foreground');
  });

  it('TabsTrigger actif a aria-current=page', () => {
    const { getByRole } = render(
      <TabsNav>
        <TabsTrigger active>Aperçu</TabsTrigger>
      </TabsNav>,
    );
    expect(getByRole('button', { name: 'Aperçu' })).toHaveAttribute('aria-current', 'page');
  });

  it('asChild enveloppe un lien en conservant le style', () => {
    const { getByRole } = render(
      <TabsNav>
        <TabsTrigger asChild active>
          <a href="/x">Devis</a>
        </TabsTrigger>
      </TabsNav>,
    );
    const link = getByRole('link', { name: 'Devis' });
    expect(link.className).toContain('border-amber-500');
  });
});
