import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MesTaches } from '@/components/test-sirh/onboarding/mes-taches';
import type { TacheLigne } from '@/lib/test-sirh/onboarding/types';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';

const tache = (p: Partial<TacheLigne> & { id: string; libelle: string }): TacheLigne => ({
  processusId: 'p1',
  processusLibelle: 'Intégration — Jean Dupont',
  typeProcessus: 'onboarding',
  employeId: 'e1',
  employeNom: 'Jean Dupont',
  description: null,
  responsable: 'salarie',
  assigneA: 'moi',
  assigneLabel: 'moi@acme.fr',
  echeance: '2026-10-25',
  statut: 'a_faire',
  dateRealisation: null,
  ordre: 10,
  enRetard: false,
  ...p,
});

const taches = [
  tache({ id: 't1', libelle: 'Lire le livret d’accueil', echeance: '2026-10-12', enRetard: true }),
  tache({
    id: 't2',
    libelle: 'Fournir le RIB',
    echeance: null,
    processusId: null,
    processusLibelle: null,
  }),
];

describe('MesTaches', () => {
  it('liste les tâches, signale le retard et lie la fiche processus', () => {
    render(
      <MesTaches
        taches={taches}
        today={TODAY}
        basculer={vi.fn()}
        baseProcessus="/acme/test-sirh/onboarding"
      />,
    );
    expect(screen.getByText('Lire le livret d’accueil')).toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.getByText('Sans échéance')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Intégration — Jean Dupont' })).toHaveAttribute(
      'href',
      '/acme/test-sirh/onboarding/p1',
    );
  });

  it('sans accès à l’onboarding : contexte affiché sans lien', () => {
    render(<MesTaches taches={taches} today={TODAY} basculer={vi.fn()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Intégration — Jean Dupont')).toBeInTheDocument();
  });

  it('coche une tâche et signale une erreur serveur', async () => {
    const basculer = vi.fn().mockResolvedValue({ ok: false, error: 'Tâche introuvable.' });
    render(<MesTaches taches={taches} today={TODAY} basculer={basculer} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /fournir le rib/i }));
    await waitFor(() => expect(basculer).toHaveBeenCalledWith('t2', true));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Tâche introuvable.'));
  });

  it('état vide et limite', () => {
    const { rerender } = render(<MesTaches taches={[]} today={TODAY} basculer={vi.fn()} />);
    expect(screen.getByText('Aucune tâche en attente.')).toBeInTheDocument();
    rerender(<MesTaches taches={taches} today={TODAY} basculer={vi.fn()} limite={1} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('liste d’un tiers : seules les tâches assignées à l’utilisateur sont cochables', () => {
    const liste = [
      ...taches,
      tache({ id: 't3', libelle: 'Remettre le badge', assigneA: 'quelquun' }),
    ];
    const { rerender } = render(
      <MesTaches taches={liste} today={TODAY} basculer={vi.fn()} utilisateurId="moi" />,
    );
    expect(screen.getByRole('checkbox', { name: /remettre le badge/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /fournir le rib/i })).toBeEnabled();
    rerender(
      <MesTaches taches={liste} today={TODAY} basculer={vi.fn()} utilisateurId="moi" peutGerer />,
    );
    expect(screen.getByRole('checkbox', { name: /remettre le badge/i })).toBeEnabled();
  });
});
