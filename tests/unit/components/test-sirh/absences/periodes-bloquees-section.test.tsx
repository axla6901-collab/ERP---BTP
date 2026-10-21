import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PeriodesBloqueesSection } from '@/components/test-sirh/absences/periodes-bloquees-section';
import type { PeriodeBloqueeLigne } from '@/lib/test-sirh/absences/types';

import type * as ModuleOptionSelect from '@/components/test-sirh/option-select';

import { installerPolyfillsJsdom } from './outils-tests';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/test-sirh/option-select', async (importOriginal) => ({
  ...(await importOriginal<typeof ModuleOptionSelect>()),
  OptionSelect: (await import('./outils-tests')).OptionSelectNatif,
}));

beforeAll(installerPolyfillsJsdom);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';
const CP = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const EQUIPE = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';

const PERIODES: PeriodeBloqueeLigne[] = [
  {
    id: 'p1',
    libelle: 'Livraison lot 3',
    dateDebut: '2026-11-02',
    dateFin: '2026-11-06',
    typeAbsenceId: CP,
    typeLibelle: 'Congés payés',
    typeCouleur: '#f59e0b',
    equipeId: EQUIPE,
    equipe: 'Équipe gros œuvre',
    motif: 'Réception client',
  },
  {
    id: 'p2',
    libelle: 'Fermeture estivale',
    dateDebut: '2026-08-03',
    dateFin: '2026-08-21',
    typeAbsenceId: null,
    typeLibelle: null,
    typeCouleur: null,
    equipeId: null,
    equipe: null,
    motif: null,
  },
];

function creerActions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'p3' } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

function rendre(peutGerer = true, actions = creerActions()) {
  render(
    <PeriodesBloqueesSection
      periodes={PERIODES}
      types={[{ id: CP, label: 'Congés payés (CP)' }]}
      equipes={[{ id: EQUIPE, label: 'Équipe gros œuvre' }]}
      today={TODAY}
      peutGerer={peutGerer}
      actions={actions}
    />,
  );
  return actions;
}

describe('PeriodesBloqueesSection', () => {
  it('affiche dates, type et équipe visés (ou « tous »), période passée signalée', () => {
    rendre();
    expect(screen.getByText('Livraison lot 3')).toBeInTheDocument();
    expect(screen.getByText('du 02/11/2026 au 06/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Congés payés')).toBeInTheDocument();
    expect(screen.getByText('Équipe gros œuvre')).toBeInTheDocument();
    expect(screen.getByText('Tous (soumis à validation)')).toBeInTheDocument();
    expect(screen.getByText('Toutes')).toBeInTheDocument();
    expect(screen.getByText('Passée')).toBeInTheDocument();
  });

  it('lecture seule : pas de création ni de suppression', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /nouvelle période/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('crée une période bloquée pour une équipe', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle période/i }));
    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Inventaire dépôt' },
    });
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-12-28' } });
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-12-31' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Équipe' }), {
      target: { value: EQUIPE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer la période' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith({
        id: undefined,
        libelle: 'Inventaire dépôt',
        dateDebut: '2026-12-28',
        dateFin: '2026-12-31',
        typeAbsenceId: null,
        equipeId: EQUIPE,
        motif: null,
      }),
    );
  });

  it('refuse une fin antérieure au début sans appeler le serveur', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle période/i }));
    fireEvent.change(await screen.findByLabelText('Libellé'), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2026-12-28' } });
    fireEvent.change(screen.getByLabelText('Au'), { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer la période' }));
    expect(
      await screen.findByText('La date de fin doit être postérieure ou égale à la date de début.'),
    ).toBeInTheDocument();
    expect(actions.enregistrer).not.toHaveBeenCalled();
  });
});
