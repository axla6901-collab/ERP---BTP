import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { LancerProcessusDialog } from '@/components/test-sirh/onboarding/lancer-processus-dialog';
import type { EmployeLancement, ModeleLancement } from '@/lib/test-sirh/onboarding/types';

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh, prefetch: vi.fn() }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';
const MODELE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const EMPLOYE = '8a7d6c5b-4e3f-4a1b-9c2d-1e0f2a3b4c5d';

const modeles: ModeleLancement[] = [
  {
    id: MODELE,
    nom: 'Intégration compagnon BTP',
    typeProcessus: 'onboarding',
    taches: [
      { libelle: 'Contrat', description: null, responsable: 'rh', delaiJours: -5, ordre: 10 },
      {
        libelle: 'Accueil sécurité',
        description: null,
        responsable: 'manager',
        delaiJours: 0,
        ordre: 20,
      },
      {
        libelle: 'Point à un mois',
        description: null,
        responsable: 'manager',
        delaiJours: 30,
        ordre: 30,
      },
    ],
  },
];

const employes: EmployeLancement[] = [
  {
    id: EMPLOYE,
    label: 'Dupont Jean',
    nomComplet: 'Jean Dupont',
    actif: true,
    dateArrivee: '2026-11-02',
    dateDepart: null,
  },
];

describe('LancerProcessusDialog', () => {
  it('pré-remplit libellé et date d’arrivée, affiche l’aperçu des échéances puis lance', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'p-new', nbTaches: 3 } });
    render(
      <LancerProcessusDialog
        open
        onOpenChange={vi.fn()}
        modeles={modeles}
        employes={employes}
        today={TODAY}
        modeleInitialId={MODELE}
        employeInitialId={EMPLOYE}
        onSubmit={onSubmit}
        baseFiches="/acme/test-sirh/onboarding"
      />,
    );
    expect(screen.getByLabelText('Libellé')).toHaveValue('Intégration compagnon BTP — Jean Dupont');
    expect(screen.getByLabelText('Date d’arrivée')).toHaveValue('2026-11-02');
    expect(screen.getByText('3 tâches')).toBeInTheDocument();
    expect(
      screen.getByText(/du 28\/10\/2026 \(J-5\) au 02\/12\/2026 \(J\+30\)/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /lancer le processus/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        modeleId: MODELE,
        employeId: EMPLOYE,
        dateReference: '2026-11-02',
        libelle: 'Intégration compagnon BTP — Jean Dupont',
        assignationAuto: true,
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/acme/test-sirh/onboarding/p-new'));
  });

  it('conserve un libellé saisi manuellement', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'p-new', nbTaches: 3 } });
    render(
      <LancerProcessusDialog
        open
        onOpenChange={vi.fn()}
        modeles={modeles}
        employes={employes}
        today={TODAY}
        modeleInitialId={MODELE}
        employeInitialId={EMPLOYE}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Arrivée de Jean' } });
    fireEvent.click(screen.getByRole('button', { name: /lancer le processus/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ libelle: 'Arrivée de Jean' }),
      ),
    );
    expect(push).not.toHaveBeenCalled();
    // La server action revalide la page : pas de second rendu via router.refresh().
    expect(refresh).not.toHaveBeenCalled();
  });

  it('exige un modèle et un collaborateur', async () => {
    const onSubmit = vi.fn();
    render(
      <LancerProcessusDialog
        open
        onOpenChange={vi.fn()}
        modeles={modeles}
        employes={employes}
        today={TODAY}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByLabelText('Date de référence')).toHaveValue(TODAY);
    fireEvent.click(screen.getByRole('button', { name: /lancer le processus/i }));
    await waitFor(() => expect(screen.getByText('Choisissez un modèle.')).toBeInTheDocument());
    expect(screen.getByText('Choisissez un collaborateur.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('affiche l’erreur serveur (ex. processus déjà en cours)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Un processus issu de ce modèle est déjà en cours pour ce collaborateur.',
    });
    render(
      <LancerProcessusDialog
        open
        onOpenChange={vi.fn()}
        modeles={modeles}
        employes={employes}
        today={TODAY}
        modeleInitialId={MODELE}
        employeInitialId={EMPLOYE}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /lancer le processus/i }));
    await waitFor(() => expect(screen.getByText(/déjà en cours/)).toBeInTheDocument());
  });

  it('sans modèle actif : invite à en créer un', () => {
    render(
      <LancerProcessusDialog
        open
        onOpenChange={vi.fn()}
        modeles={[]}
        employes={employes}
        today={TODAY}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('Aucun modèle actif')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lancer le processus/i })).not.toBeInTheDocument();
  });
});
