import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...reste
  }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...reste}>
      {children}
    </a>
  ),
}));

import {
  FiltresEntretiens,
  urlFiltresEntretiens,
} from '@/components/test-sirh/entretiens/filtres-entretiens';

afterEach(() => cleanup());

const C1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const EV = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const BASE = '/acme/test-sirh';

describe('urlFiltresEntretiens', () => {
  it('omet les filtres vides', () => {
    expect(urlFiltresEntretiens(BASE, { campagneId: null, statut: null, evaluateurId: null })).toBe(
      `${BASE}/entretiens/liste`,
    );
  });

  it('combine campagne, statut et évaluateur', () => {
    expect(
      urlFiltresEntretiens(BASE, { campagneId: C1, statut: 'planifie', evaluateurId: EV }),
    ).toBe(`${BASE}/entretiens/liste?campagne=${C1}&statut=planifie&evaluateur=${EV}`);
  });
});

describe('FiltresEntretiens', () => {
  it('les pastilles de statut conservent les autres filtres et affichent les compteurs', () => {
    render(
      <FiltresEntretiens
        base={BASE}
        campagnes={[{ id: C1, label: 'Entretiens annuels 2026' }]}
        evaluateurs={[{ id: EV, label: 'Paul Martin' }]}
        courant={{ campagneId: C1, statut: null, evaluateurId: null }}
        compteurs={{ planifie: 3 }}
      />,
    );
    const planifie = screen.getByRole('link', { name: /^planifié/i });
    expect(planifie).toHaveAttribute(
      'href',
      `${BASE}/entretiens/liste?campagne=${C1}&statut=planifie`,
    );
    expect(planifie).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: 'Tous' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('combobox', { name: 'Filtrer par campagne' })).toHaveTextContent(
      'Entretiens annuels 2026',
    );
  });
});
