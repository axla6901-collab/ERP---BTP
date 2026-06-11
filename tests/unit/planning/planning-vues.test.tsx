import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

import { PlanningVues } from '@/components/planning/planning-vues';
import type { PlanningChantierSommaire } from '@/lib/planning/planning';

function som(p: Partial<PlanningChantierSommaire> = {}): PlanningChantierSommaire {
  return {
    id: 'c1',
    numero: 'CH-2026-0001',
    libelle: 'Villa Dubois',
    statut: 'en_cours',
    dateDebutPrevue: null,
    dateFinPrevue: null,
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

describe('PlanningVues', () => {
  it("affiche la « Vue d'ensemble » (Gantt) par défaut, pas le tableau", () => {
    render(
      <PlanningVues
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        peutVueEnsemble={true}
        chargerTaches={vi.fn()}
      />,
    );
    // Le sélecteur de vue place « Vue d'ensemble » en pressé.
    expect(screen.getByRole('button', { name: "Vue d'ensemble" })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Le Gantt expose les boutons de zoom ; le tableau n'est pas monté.
    expect(screen.getByRole('button', { name: 'Mois' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('bascule vers la « Liste » (tableau) puis revient', () => {
    render(
      <PlanningVues
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        peutVueEnsemble={true}
        chargerTaches={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Liste' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mois' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Liste' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: "Vue d'ensemble" }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mois' })).toBeInTheDocument();
  });

  it('sans le droit, n’affiche que la Liste (aucune bascule ni Gantt)', () => {
    render(
      <PlanningVues
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        peutVueEnsemble={false}
        chargerTaches={vi.fn()}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Vue d'ensemble" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Liste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mois' })).not.toBeInTheDocument();
  });

  it('transmet chargerTaches au Gantt (appelé au dépliage)', async () => {
    const chargerTaches = vi.fn().mockResolvedValue([]);
    render(
      <PlanningVues
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        peutVueEnsemble={true}
        chargerTaches={chargerTaches}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Déplier/ }));
    expect(chargerTaches).toHaveBeenCalledWith('c1');
    // Laisse la mise à jour d'état asynchrone (cache) se résoudre dans act().
    await act(async () => {});
  });
});
