import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChecklistTaches } from '@/components/test-sirh/onboarding/checklist-taches';
import type { TacheLigne } from '@/lib/test-sirh/onboarding/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
  // base-ui Dialog s'appuie sur des API absentes de jsdom.
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
const PROCESSUS = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

const tache = (p: Partial<TacheLigne> & { id: string; libelle: string }): TacheLigne => ({
  processusId: PROCESSUS,
  processusLibelle: 'Intégration — Jean Dupont',
  typeProcessus: 'onboarding',
  employeId: 'e1',
  employeNom: 'Jean Dupont',
  description: null,
  responsable: 'rh',
  assigneA: null,
  assigneLabel: null,
  echeance: '2026-10-25',
  statut: 'a_faire',
  dateRealisation: null,
  ordre: 10,
  enRetard: false,
  ...p,
});

const taches: TacheLigne[] = [
  tache({
    id: 't1',
    libelle: 'Effectuer la DPAE',
    assigneA: 'moi',
    assigneLabel: 'moi@acme.fr',
    echeance: '2026-10-15',
    enRetard: true,
  }),
  tache({ id: 't2', libelle: 'Remettre les EPI', responsable: 'manager', assigneA: 'autre' }),
  tache({
    id: 't3',
    libelle: 'Préparer le contrat',
    statut: 'faite',
    dateRealisation: '2026-10-12',
  }),
];

const actions = () => ({
  basculer: vi.fn().mockResolvedValue({
    ok: true,
    data: { statut: 'faite', dateRealisation: TODAY },
  }),
  changerStatut: vi.fn().mockResolvedValue({
    ok: true,
    data: { statut: 'en_cours', dateRealisation: null },
  }),
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'nouvelle' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
});

describe('ChecklistTaches', () => {
  it('salarié : coche uniquement ses tâches assignées, sans actions de gestion', async () => {
    const a = actions();
    render(
      <ChecklistTaches
        processusId={PROCESSUS}
        processusOuvert
        taches={taches}
        today={TODAY}
        peutGerer={false}
        utilisateurId="moi"
        utilisateurs={[]}
        actions={a}
      />,
    );
    const dpae = screen.getByRole('checkbox', { name: /effectuer la dpae/i });
    expect(dpae).toBeEnabled();
    expect(screen.getByRole('checkbox', { name: /remettre les epi/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /ajouter une tâche/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();

    fireEvent.click(dpae);
    await waitFor(() => expect(a.basculer).toHaveBeenCalledWith('t1', true));
  });

  it('met en évidence les tâches en retard et les tâches faites', () => {
    render(
      <ChecklistTaches
        processusId={PROCESSUS}
        processusOuvert
        taches={taches}
        today={TODAY}
        peutGerer={false}
        utilisateurId="moi"
        utilisateurs={[]}
        actions={actions()}
      />,
    );
    expect(screen.getByTestId('tache-t1')).toHaveClass('bg-rose-50/70');
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.getByText(/faite le 12\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /préparer le contrat/i })).toBeChecked();
    expect(screen.getByText('moi@acme.fr')).toBeInTheDocument();
  });

  it('gestionnaire : décoche une tâche faite et ajoute une tâche ad hoc au processus', async () => {
    const a = actions();
    render(
      <ChecklistTaches
        processusId={PROCESSUS}
        processusOuvert
        taches={taches}
        today={TODAY}
        peutGerer
        utilisateurId="rh"
        utilisateurs={[{ id: 'moi', label: 'moi@acme.fr' }]}
        actions={a}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /préparer le contrat/i }));
    await waitFor(() => expect(a.basculer).toHaveBeenCalledWith('t3', false));

    fireEvent.click(screen.getByRole('button', { name: /ajouter une tâche/i }));
    expect(screen.getByText('Nouvelle tâche')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Libellé'), {
      target: { value: 'Prévoir la tenue de travail' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ajouter la tâche$/i }));
    await waitFor(() =>
      expect(a.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          processusId: PROCESSUS,
          libelle: 'Prévoir la tenue de travail',
          responsable: 'rh',
          assigneA: null,
          echeance: null,
        }),
      ),
    );
  });

  it('gestionnaire : suppression d’une tâche après confirmation', async () => {
    const a = actions();
    render(
      <ChecklistTaches
        processusId={PROCESSUS}
        processusOuvert={false}
        taches={[taches[1]!]}
        today={TODAY}
        peutGerer
        utilisateurId="rh"
        utilisateurs={[]}
        actions={a}
      />,
    );
    // Processus clos : pas d'ajout de tâche.
    expect(screen.queryByRole('button', { name: /ajouter une tâche/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByText('Supprimer cette tâche ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(a.supprimer).toHaveBeenCalledWith('t2'));
  });

  it('affiche l’état vide', () => {
    render(
      <ChecklistTaches
        processusId={PROCESSUS}
        processusOuvert
        taches={[]}
        today={TODAY}
        peutGerer={false}
        utilisateurId="moi"
        utilisateurs={[]}
        actions={actions()}
      />,
    );
    expect(screen.getByText(/aucune tâche dans ce processus/i)).toBeInTheDocument();
  });
});
