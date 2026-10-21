import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TachesListe } from '@/components/test-sirh/onboarding/taches-liste';
import type { TacheLigne } from '@/lib/test-sirh/onboarding/types';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
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

// Lundi 19 octobre 2026.
const TODAY = '2026-10-19';
const BASE = '/acme/test-sirh/onboarding';

const tache = (p: Partial<TacheLigne> & { id: string; libelle: string }): TacheLigne => ({
  processusId: 'p1',
  processusLibelle: 'Intégration — Jean Dupont',
  typeProcessus: 'onboarding',
  employeId: 'e1',
  employeNom: 'Jean Dupont',
  description: null,
  responsable: 'rh',
  assigneA: 'moi',
  assigneLabel: 'moi@acme.fr',
  echeance: '2026-11-15',
  statut: 'a_faire',
  dateRealisation: null,
  ordre: 10,
  enRetard: false,
  ...p,
});

const taches: TacheLigne[] = [
  tache({ id: 't1', libelle: 'Effectuer la DPAE', echeance: '2026-10-12', enRetard: true }),
  tache({ id: 't2', libelle: 'Signer le contrat', statut: 'faite', dateRealisation: '2026-10-10' }),
  tache({ id: 't3', libelle: 'Accueil sécurité', echeance: '2026-10-23' }),
  tache({
    id: 't4',
    libelle: 'Renouveler la visite médicale',
    processusId: null,
    processusLibelle: null,
    typeProcessus: null,
  }),
];

const actions = () => ({
  basculer: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { statut: 'faite', dateRealisation: TODAY } }),
  changerStatut: vi.fn().mockResolvedValue({
    ok: true,
    data: { statut: 'en_cours', dateRealisation: null },
  }),
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'n' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
});

describe('TachesListe', () => {
  it('« Mes tâches » : tâches ouvertes par défaut, lien vers le processus, tâche autonome', () => {
    render(
      <TachesListe
        taches={taches}
        vue="mes"
        peutGerer={false}
        utilisateurId="moi"
        today={TODAY}
        baseOnboarding={BASE}
        utilisateurs={[]}
        employes={[]}
        actions={actions()}
      />,
    );
    expect(screen.getByText('Effectuer la DPAE')).toBeInTheDocument();
    expect(screen.queryByText('Signer le contrat')).not.toBeInTheDocument();
    expect(screen.getByText('Tâche autonome')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Intégration — Jean Dupont' })[0]).toHaveAttribute(
      'href',
      `${BASE}/p1`,
    );
    // Pas de vue « Toutes » ni de création pour un non-gestionnaire.
    expect(screen.queryByRole('link', { name: /toutes les tâches/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nouvelle tâche/i })).not.toBeInTheDocument();
  });

  it('filtre les tâches en retard, de la semaine et faites', () => {
    render(
      <TachesListe
        taches={taches}
        vue="mes"
        peutGerer={false}
        utilisateurId="moi"
        today={TODAY}
        baseOnboarding={BASE}
        utilisateurs={[]}
        employes={[]}
        actions={actions()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /en retard/i }));
    expect(screen.getByText('Effectuer la DPAE')).toBeInTheDocument();
    expect(screen.queryByText('Accueil sécurité')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cette semaine/i }));
    expect(screen.getByText('Accueil sécurité')).toBeInTheDocument();
    expect(screen.queryByText('Effectuer la DPAE')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /toutes échéances/i }));
    fireEvent.click(screen.getByRole('button', { name: /^faite/i }));
    expect(screen.getByText('Signer le contrat')).toBeInTheDocument();
    expect(screen.queryByText('Accueil sécurité')).not.toBeInTheDocument();
  });

  it('coche une tâche assignée', async () => {
    const a = actions();
    render(
      <TachesListe
        taches={taches}
        vue="mes"
        peutGerer={false}
        utilisateurId="moi"
        today={TODAY}
        baseOnboarding={BASE}
        utilisateurs={[]}
        employes={[]}
        actions={a}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /effectuer la dpae/i }));
    await waitFor(() => expect(a.basculer).toHaveBeenCalledWith('t1', true));
  });

  it('gestionnaire : bascule de vue par URL et création d’une tâche autonome', async () => {
    const a = actions();
    render(
      <TachesListe
        taches={taches}
        vue="toutes"
        peutGerer
        utilisateurId="rh"
        today={TODAY}
        baseOnboarding={BASE}
        utilisateurs={[{ id: 'moi', label: 'moi@acme.fr' }]}
        employes={[{ id: 'e1', label: 'Dupont Jean' }]}
        actions={a}
      />,
    );
    expect(screen.getByRole('link', { name: /mes tâches/i })).toHaveAttribute(
      'href',
      `${BASE}/taches`,
    );
    expect(screen.getByRole('link', { name: /toutes les tâches/i })).toHaveAttribute(
      'href',
      `${BASE}/taches?vue=toutes`,
    );

    fireEvent.click(screen.getByRole('button', { name: /nouvelle tâche/i }));
    expect(screen.getByText(/tâche rh autonome/i)).toBeInTheDocument();
    expect(screen.getByText('Collaborateur concerné')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Libellé'), {
      target: { value: 'Organiser la visite médicale' },
    });
    fireEvent.change(screen.getByLabelText('Échéance'), { target: { value: '2026-11-05' } });
    fireEvent.click(screen.getByRole('button', { name: /^ajouter la tâche$/i }));
    await waitFor(() =>
      expect(a.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          processusId: null,
          employeId: null,
          libelle: 'Organiser la visite médicale',
          echeance: '2026-11-05',
        }),
      ),
    );
  });
});
