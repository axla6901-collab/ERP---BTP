import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

import { PlanningListeTable } from '@/components/planning/planning-liste-table';
import type { PlanningChantierSommaire } from '@/lib/planning/planning';

function som(p: Partial<PlanningChantierSommaire> = {}): PlanningChantierSommaire {
  return {
    id: 'c1',
    numero: 'CH-2026-0001',
    libelle: 'Villa Dubois',
    statut: 'en_cours',
    dateDebutPrevue: '2026-05-02',
    dateFinPrevue: '2026-05-20',
    nbTaches: 3,
    avancementPourcent: 68,
    dateMinTaches: '2026-05-02',
    dateMaxTaches: '2026-05-20',
    ...p,
  };
}

afterEach(() => {
  cleanup();
});

describe('PlanningListeTable', () => {
  it('rend une ligne par chantier avec statut, période et drill-down', () => {
    render(
      <PlanningListeTable
        chantiers={[
          som({ id: 'a', numero: 'CH-A', libelle: 'Alpha' }),
          som({ id: 'b', numero: 'CH-B', libelle: 'Beta', statut: 'termine' }),
        ]}
        entrepriseSlug="acme"
      />,
    );

    // 1 ligne d'en-tête + 2 lignes de données.
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('Terminé')).toBeInTheDocument();
    expect(screen.getAllByText('2026-05-02 → 2026-05-20')).toHaveLength(2);

    expect(screen.getByLabelText('Ouvrir le planning de Alpha')).toHaveAttribute(
      'href',
      '/acme/chantiers/a/planning',
    );
  });

  it('affiche « — » quand l’avancement est nul', () => {
    render(
      <PlanningListeTable
        chantiers={[som({ avancementPourcent: null })]}
        entrepriseSlug="acme"
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
