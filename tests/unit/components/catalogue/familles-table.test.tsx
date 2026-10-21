import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: pushMock, refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { FamillesTable } from '@/components/catalogue/familles-table';
import type { FamilleAvecParent } from '@/lib/catalogue/familles';

function famille(partiel: Partial<FamilleAvecParent>): FamilleAvecParent {
  return {
    id: 'f1',
    code: 'GO',
    libelle: 'Gros œuvre',
    actif: true,
    parentCode: null,
    parentLibelle: null,
    ...partiel,
  } as FamilleAvecParent;
}

afterEach(() => {
  cleanup();
  pushMock.mockReset();
});

describe('FamillesTable — liens préfixés par le slug d’entreprise', () => {
  it('le lien « Modifier » pointe directement vers l’URL préfixée', () => {
    render(<FamillesTable items={[famille({})]} peutEcrire />);
    expect(screen.getByRole('link', { name: 'Modifier' })).toHaveAttribute(
      'href',
      '/acme/catalogue/familles/f1',
    );
  });

  it('libellé « Voir » en lecture seule, même URL préfixée', () => {
    render(<FamillesTable items={[famille({})]} peutEcrire={false} />);
    expect(screen.getByRole('link', { name: 'Voir' })).toHaveAttribute(
      'href',
      '/acme/catalogue/familles/f1',
    );
  });

  it('le clic sur la ligne navigue vers l’URL préfixée (sans redirection middleware)', () => {
    render(<FamillesTable items={[famille({})]} peutEcrire />);
    fireEvent.click(screen.getByText('Gros œuvre'));
    expect(pushMock).toHaveBeenCalledWith('/acme/catalogue/familles/f1');
  });
});
