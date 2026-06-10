import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { CreerPlanningButton } from '@/components/planning/creer-planning-button';
import type { PlanningChantierSommaire } from '@/lib/planning/planning';

function chantier(over: Partial<PlanningChantierSommaire> = {}): PlanningChantierSommaire {
  return {
    id: 'c-1',
    numero: 'CH-2026-0001',
    libelle: 'Rénovation Dupont',
    statut: 'en_cours',
    dateDebutPrevue: null,
    dateFinPrevue: null,
    nbTaches: 0,
    avancementPourcent: null,
    dateMinTaches: null,
    dateMaxTaches: null,
    ...over,
  };
}

afterEach(() => {
  cleanup();
});

describe('CreerPlanningButton', () => {
  it('affiche le bouton « Créer un planning »', () => {
    render(
      <CreerPlanningButton
        chantiersSansPlanning={[chantier()]}
        entrepriseSlug="acme"
      />,
    );
    expect(screen.getByRole('button', { name: /créer un planning/i })).toBeInTheDocument();
  });

  it("désactive le bouton quand aucun chantier n'est éligible", () => {
    render(<CreerPlanningButton chantiersSansPlanning={[]} entrepriseSlug="acme" />);
    const btn = screen.getByRole('button', { name: /créer un planning/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute(
      'title',
      'Tous les chantiers ont déjà un planning',
    );
  });

  it('ouvre la modale et liste les chantiers sans planning', () => {
    render(
      <CreerPlanningButton
        chantiersSansPlanning={[
          chantier({ id: 'a', numero: 'CH-A', libelle: 'Alpha' }),
          chantier({ id: 'b', numero: 'CH-B', libelle: 'Beta' }),
        ]}
        entrepriseSlug="acme"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /créer un planning/i }));

    const liens = screen.getAllByRole('link');
    expect(liens).toHaveLength(2);
    expect(liens[0]).toHaveAttribute('href', '/acme/chantiers/a/planning');
    expect(liens[1]).toHaveAttribute('href', '/acme/chantiers/b/planning');
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('filtre la liste à la frappe (recherche)', () => {
    render(
      <CreerPlanningButton
        chantiersSansPlanning={[
          chantier({ id: 'a', numero: 'CH-A', libelle: 'Alpha' }),
          chantier({ id: 'b', numero: 'CH-B', libelle: 'Beta' }),
        ]}
        entrepriseSlug="acme"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /créer un planning/i }));
    const search = screen.getByLabelText('Rechercher un chantier');
    fireEvent.change(search, { target: { value: 'beta' } });

    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('message dédié quand la recherche ne renvoie rien', () => {
    render(
      <CreerPlanningButton
        chantiersSansPlanning={[chantier({ libelle: 'Alpha' })]}
        entrepriseSlug="acme"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /créer un planning/i }));
    fireEvent.change(screen.getByLabelText('Rechercher un chantier'), {
      target: { value: 'zzz' },
    });

    expect(screen.getByText(/aucun résultat pour « zzz »/i)).toBeInTheDocument();
  });
});
