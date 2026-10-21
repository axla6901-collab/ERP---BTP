import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { TypesAbsenceSection } from '@/components/test-sirh/absences/types-absence-section';
import type { TypeAbsenceLigne } from '@/lib/test-sirh/absences/types';

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

import { toast } from 'sonner';

beforeAll(installerPolyfillsJsdom);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CP: TypeAbsenceLigne = {
  id: '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70',
  code: 'CP',
  libelle: 'Congés payés',
  categorie: 'conges',
  uniteDecompte: 'jours_ouvrables',
  avecSolde: true,
  necessiteValidation: true,
  justificatifRequis: false,
  remuneree: true,
  couleur: '#f59e0b',
  codeRubriquePaie: 'ABS-CP',
  actif: true,
  ordre: 10,
  nbAbsences: 3,
  nbCompteurs: 2,
};

const CSS: TypeAbsenceLigne = {
  ...CP,
  id: '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f',
  code: 'CSS',
  libelle: 'Congé sans solde',
  categorie: 'sans_solde',
  uniteDecompte: 'jours_ouvres',
  avecSolde: false,
  necessiteValidation: false,
  justificatifRequis: true,
  remuneree: false,
  codeRubriquePaie: null,
  actif: false,
  nbAbsences: 0,
  nbCompteurs: 0,
};

function creerActions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'nouveau' } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

describe('TypesAbsenceSection', () => {
  it('affiche catégorie, décompte, règles, rubrique, utilisation et statut', () => {
    render(<TypesAbsenceSection types={[CP, CSS]} peutGerer actions={creerActions()} />);
    expect(screen.getByText('Congés payés')).toBeInTheDocument();
    expect(screen.getByText('Jours ouvrables (lun.–sam.)')).toBeInTheDocument();
    expect(screen.getByText('Solde')).toBeInTheDocument();
    expect(screen.getByText('Validation')).toBeInTheDocument();
    expect(screen.getByText('Sans validation')).toBeInTheDocument();
    expect(screen.getByText('Justificatif')).toBeInTheDocument();
    expect(screen.getByText('Non rémunérée')).toBeInTheDocument();
    expect(screen.getByText('ABS-CP')).toBeInTheDocument();
    expect(screen.getByText('3 abs. · 2 cpt.')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('lecture seule : ni création ni suppression', () => {
    render(<TypesAbsenceSection types={[CP]} peutGerer={false} actions={creerActions()} />);
    expect(screen.queryByRole('button', { name: /nouveau type/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('crée un type : code en majuscules, toutes les clés transmises', async () => {
    const actions = creerActions();
    render(<TypesAbsenceSection types={[]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: /nouveau type/i }));
    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Récupération chantier' },
    });
    fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'rec' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Unité de décompte' }), {
      target: { value: 'heures' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le type' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith({
        id: undefined,
        code: 'REC',
        libelle: 'Récupération chantier',
        categorie: 'conges',
        uniteDecompte: 'heures',
        avecSolde: false,
        necessiteValidation: true,
        justificatifRequis: false,
        remuneree: true,
        couleur: '#f59e0b',
        codeRubriquePaie: null,
        actif: true,
        ordre: 0,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Type d’absence créé');
  });

  it('suppression refusée (type utilisé) : message du serveur affiché', async () => {
    const actions = creerActions();
    actions.supprimer.mockResolvedValueOnce({
      ok: false,
      error: "Suppression impossible : ce type d'absence est référencé par 3 absences.",
    });
    render(<TypesAbsenceSection types={[CP]} peutGerer actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith(CP.id));
    expect(toast.error).toHaveBeenCalledWith(
      "Suppression impossible : ce type d'absence est référencé par 3 absences.",
    );
  });
});
