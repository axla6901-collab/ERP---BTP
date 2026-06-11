import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

import { GanttMultiChantier } from '@/components/planning/gantt-multi-chantier';
import type { PlanningChantierSommaire, PlanningTacheRow } from '@/lib/planning/planning';

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

function tache(p: Partial<PlanningTacheRow>): PlanningTacheRow {
  return {
    id: crypto.randomUUID(),
    entrepriseId: '00000000-0000-0000-0000-000000000000',
    chantierId: 'c1',
    ordre: 0,
    libelle: 'Tâche',
    description: null,
    responsableId: null,
    statut: 'a_faire',
    avancementPourcent: 0,
    dateDebutPrevue: null,
    dateFinPrevue: null,
    dateDebutReelle: null,
    dateFinReelle: null,
    niveau: null,
    corpsMetier: null,
    heuresPlanifiees: 0,
    estJalon: false,
    predecesseurId: null,
    notes: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    createdBy: null,
    updatedBy: null,
    deletedAt: null,
    equipe: [],
    ...p,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
});

describe('GanttMultiChantier', () => {
  it('affiche une ligne (un bouton de dépliage) par chantier', () => {
    render(
      <GanttMultiChantier
        chantiers={[som({ id: 'a', libelle: 'Alpha' }), som({ id: 'b', libelle: 'Beta' })]}
        entrepriseSlug="acme"
        today="2026-06-15"
        chargerTaches={vi.fn().mockResolvedValue([])}
      />,
    );
    expect(screen.getAllByRole('button', { name: /Déplier/ })).toHaveLength(2);
  });

  it("la largeur de la frise ne change pas au dépliage (pas de saut d'axe)", async () => {
    const chargerTaches = vi.fn().mockResolvedValue([
      tache({
        id: 't1',
        libelle: 'Fondations',
        dateDebutPrevue: '2026-05-03',
        dateFinPrevue: '2026-05-09',
      }),
    ]);
    render(
      <GanttMultiChantier
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        chargerTaches={chargerTaches}
      />,
    );
    const largeurAvant = parseFloat(screen.getByTitle('Villa Dubois — 68%').style.width);
    fireEvent.click(screen.getByRole('button', { name: /(Déplier|Replier) Villa Dubois/ }));
    await screen.findByTitle('Fondations — 0%');
    const largeurApres = parseFloat(screen.getByTitle('Villa Dubois — 68%').style.width);
    expect(largeurApres).toBe(largeurAvant);
  });

  it('déplie : montre « Chargement… » puis les barres des tâches', async () => {
    const d = deferred<PlanningTacheRow[]>();
    const chargerTaches = vi.fn().mockReturnValue(d.promise);
    render(
      <GanttMultiChantier
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        chargerTaches={chargerTaches}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /(Déplier|Replier) Villa Dubois/ }));
    expect(chargerTaches).toHaveBeenCalledTimes(1);
    expect(chargerTaches).toHaveBeenCalledWith('c1');
    expect(screen.getByText('Chargement…')).toBeInTheDocument();

    await act(async () => {
      d.resolve([
        tache({
          id: 't1',
          libelle: 'Fondations',
          avancementPourcent: 60,
          dateDebutPrevue: '2026-05-03',
          dateFinPrevue: '2026-05-09',
        }),
      ]);
    });

    expect(screen.getByTitle('Fondations — 60%')).toBeInTheDocument();
    expect(screen.queryByText('Chargement…')).not.toBeInTheDocument();
  });

  it('replie puis redéplie : utilise le cache (pas de second chargement)', async () => {
    const chargerTaches = vi.fn().mockResolvedValue([
      tache({
        id: 't1',
        libelle: 'Fondations',
        dateDebutPrevue: '2026-05-03',
        dateFinPrevue: '2026-05-09',
      }),
    ]);
    render(
      <GanttMultiChantier
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        chargerTaches={chargerTaches}
      />,
    );
    const btn = () => screen.getByRole('button', { name: /(Déplier|Replier) Villa Dubois/ });

    fireEvent.click(btn());
    await screen.findByTitle('Fondations — 0%');
    fireEvent.click(btn()); // replie
    expect(screen.queryByTitle('Fondations — 0%')).not.toBeInTheDocument();
    fireEvent.click(btn()); // redéplie depuis le cache
    expect(screen.getByTitle('Fondations — 0%')).toBeInTheDocument();
    expect(chargerTaches).toHaveBeenCalledTimes(1);
  });

  it('lien drill-down vers le planning complet du chantier', () => {
    render(
      <GanttMultiChantier
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        chargerTaches={vi.fn()}
      />,
    );
    expect(screen.getByTitle('Ouvrir le planning de Villa Dubois')).toHaveAttribute(
      'href',
      '/acme/chantiers/c1/planning',
    );
  });

  it('rend un jalon en losange (rotate 45) plutôt qu’une barre', async () => {
    const chargerTaches = vi.fn().mockResolvedValue([
      tache({
        id: 'j1',
        libelle: 'Jalon',
        estJalon: true,
        avancementPourcent: 100,
        dateDebutPrevue: '2026-05-10',
        dateFinPrevue: '2026-05-10',
      }),
    ]);
    render(
      <GanttMultiChantier
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        chargerTaches={chargerTaches}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /(Déplier|Replier) Villa Dubois/ }));
    const losange = await screen.findByTitle('Jalon — 100%');
    expect(losange.style.transform).toContain('rotate(45deg)');
  });

  it('le zoom recalcule la largeur des barres', () => {
    render(
      <GanttMultiChantier
        chantiers={[som()]}
        entrepriseSlug="acme"
        today="2026-06-15"
        chargerTaches={vi.fn()}
      />,
    );
    const largeurMois = parseFloat(screen.getByTitle('Villa Dubois — 68%').style.width);
    fireEvent.click(screen.getByRole('button', { name: 'Jour' }));
    const largeurJour = parseFloat(screen.getByTitle('Villa Dubois — 68%').style.width);
    expect(largeurJour).toBeGreaterThan(largeurMois);
  });

  it('chantier sans dates : affiche « à planifier » sans planter', () => {
    render(
      <GanttMultiChantier
        chantiers={[som({ dateMinTaches: null, dateMaxTaches: null, avancementPourcent: null })]}
        entrepriseSlug="acme"
        today="2026-06-15"
        chargerTaches={vi.fn()}
      />,
    );
    expect(screen.getByText('à planifier')).toBeInTheDocument();
  });
});
