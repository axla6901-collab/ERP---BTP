import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { UnitesTable } from '@/components/catalogue/unites-table';
import type { Unite } from '@/db/schema/catalogue';

function unite(over: Partial<Unite> = {}): Unite {
  return {
    id: 'u1',
    code: 'KG',
    libelle: 'Kilogramme',
    symbole: 'kg',
    type: 'masse',
    actif: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    ...over,
  } as Unite;
}

afterEach(() => {
  cleanup();
});

describe('UnitesTable', () => {
  it('rend le code, le libellé, le symbole et le libellé de type', () => {
    render(<UnitesTable items={[unite()]} peutEcrire />);
    expect(screen.getByText('KG')).toBeInTheDocument();
    expect(screen.getByText('Kilogramme')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    expect(screen.getByText('Masse')).toBeInTheDocument();
  });

  it('lie chaque ligne vers /administration/unites/:id (et non /catalogue)', () => {
    render(<UnitesTable items={[unite({ id: 'abc' })]} peutEcrire />);
    const lien = screen.getByRole('link', { name: 'Modifier' });
    expect(lien).toHaveAttribute('href', '/administration/unites/abc');
  });

  it('affiche « Voir » au lieu de « Modifier » en lecture seule', () => {
    render(<UnitesTable items={[unite()]} peutEcrire={false} />);
    expect(screen.getByRole('link', { name: 'Voir' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Modifier' })).not.toBeInTheDocument();
  });

  it('affiche le statut Actif / Inactif', () => {
    const { rerender } = render(<UnitesTable items={[unite({ actif: true })]} peutEcrire />);
    expect(screen.getByText('Actif')).toBeInTheDocument();
    rerender(<UnitesTable items={[unite({ actif: false })]} peutEcrire />);
    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });
});
