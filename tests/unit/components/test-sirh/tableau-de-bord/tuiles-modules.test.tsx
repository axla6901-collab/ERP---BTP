import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TUILES_SIRH, TuilesModules } from '@/components/test-sirh/tableau-de-bord/tuiles-modules';

afterEach(cleanup);

describe('TuilesModules', () => {
  it('admin : toutes les rubriques, liens préfixés par la base du module', () => {
    render(<TuilesModules base="/acme/test-sirh" role="admin" />);
    expect(screen.getAllByRole('link')).toHaveLength(TUILES_SIRH.length);
    expect(screen.getByRole('link', { name: /Paie/ })).toHaveAttribute(
      'href',
      '/acme/test-sirh/paie',
    );
  });

  it('ouvrier : uniquement les rubriques libre-service', () => {
    render(<TuilesModules base="/acme/test-sirh" role="ouvrier" />);
    const titres = screen.getAllByRole('link').map((l) => l.textContent ?? '');
    expect(titres.some((t) => t.startsWith('Mon espace'))).toBe(true);
    expect(titres.some((t) => t.startsWith('Annonces'))).toBe(true);
    expect(titres).toHaveLength(2);
  });

  it('comptable : paie visible, validations masquées', () => {
    render(<TuilesModules base="/b" role="comptable" />);
    expect(screen.getByRole('link', { name: /Paie/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Validations/ })).not.toBeInTheDocument();
  });
});
