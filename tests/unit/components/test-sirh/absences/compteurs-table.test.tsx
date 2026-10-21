import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CompteursTable } from '@/components/test-sirh/absences/compteurs-table';
import type { CompteurLigne } from '@/lib/test-sirh/absences/types';

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
const C1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const C2 = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const E1 = '0c9b8a7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const CP = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382716';

const CP_MARC: CompteurLigne = {
  id: C1,
  employeId: E1,
  employe: 'Marc Dubois',
  matricule: 'M001',
  typeAbsenceId: CP,
  typeCode: 'CP',
  typeLibelle: 'Congés payés',
  couleur: '#f59e0b',
  unite: 'jours_ouvrables',
  periodeDebut: '2026-04-01',
  periodeFin: '2027-03-31',
  droitsAcquis: 30,
  report: 2.5,
  totalAjustements: 1,
  pris: 12,
  enAttente: 3,
  solde: 21.5,
  soldePrevisionnel: 18.5,
  notes: null,
  ajustements: [{ id: 'aj1', dateAjustement: '2026-06-01', valeur: 1, motif: 'Ancienneté' }],
};

const RTT_LEA: CompteurLigne = {
  ...CP_MARC,
  id: C2,
  employeId: 'e2',
  employe: 'Léa Martin',
  matricule: null,
  typeAbsenceId: 'rtt',
  typeCode: 'RTT',
  typeLibelle: 'RTT',
  couleur: '#0ea5e9',
  unite: 'jours_ouvres',
  droitsAcquis: 10,
  report: 0,
  totalAjustements: 0,
  pris: 12,
  enAttente: 0,
  solde: -2,
  soldePrevisionnel: -2,
  ajustements: [],
};

function creerGestion() {
  return {
    employes: [{ id: E1, label: 'Dubois Marc' }],
    types: [
      { id: CP, label: 'Congés payés (CP)', code: 'CP', uniteDecompte: 'jours_ouvrables' as const },
    ],
    actions: {
      enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: C1 } }),
      supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
      ajouterAjustement: vi.fn().mockResolvedValue({ ok: true, data: { id: 'aj2' } }),
      supprimerAjustement: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    },
  };
}

describe('CompteursTable', () => {
  it('affiche droits, report, ajustements, pris, en attente et solde', () => {
    render(<CompteursTable compteurs={[CP_MARC, RTT_LEA]} today={TODAY} />);
    expect(screen.getByText('Marc Dubois')).toBeInTheDocument();
    expect(screen.getByText('30 j')).toBeInTheDocument();
    expect(screen.getByText('2,5 j')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 j' })).toBeInTheDocument();
    expect(screen.getByText('3 j')).toBeInTheDocument();
    expect(screen.getByText('21,5 j')).toBeInTheDocument();
    expect(screen.getByText('prév. 18,5 j')).toBeInTheDocument();
    expect(screen.getByText('-2 j')).toHaveClass('text-rose-700');
  });

  it('lecture seule : pas d’action de gestion, détail des ajustements consultable', async () => {
    render(<CompteursTable compteurs={[CP_MARC]} today={TODAY} />);
    expect(screen.queryByRole('button', { name: /nouveau compteur/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+1 j' }));
    expect(await screen.findByText('Solde et ajustements')).toBeInTheDocument();
    expect(screen.getByText('Ancienneté')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter l’ajustement' })).not.toBeInTheDocument();
  });

  it('masque la colonne collaborateur (dossier, Mon espace)', () => {
    render(<CompteursTable compteurs={[CP_MARC]} today={TODAY} masquerEmploye />);
    expect(screen.queryByText('Marc Dubois')).not.toBeInTheDocument();
    expect(screen.getByText('Congés payés')).toBeInTheDocument();
  });

  it('gestion : ajoute un ajustement signé', async () => {
    const gestion = creerGestion();
    render(<CompteursTable compteurs={[CP_MARC]} today={TODAY} gestion={gestion} />);
    expect(screen.getByRole('button', { name: /nouveau compteur/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ajuster le compteur CP de Marc Dubois' }));
    fireEvent.change(await screen.findByLabelText('Valeur (+ crédit / − débit)'), {
      target: { value: '-1' },
    });
    fireEvent.change(screen.getByLabelText('Motif'), { target: { value: 'Régularisation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter l’ajustement' }));
    await waitFor(() =>
      expect(gestion.actions.ajouterAjustement).toHaveBeenCalledWith({
        compteurId: C1,
        dateAjustement: TODAY,
        valeur: '-1.00',
        motif: 'Régularisation',
      }),
    );
  });

  it('gestion : crée un compteur (période BTP et droits CP par défaut)', async () => {
    const gestion = creerGestion();
    render(<CompteursTable compteurs={[]} today={TODAY} gestion={gestion} />);
    fireEvent.click(screen.getByRole('button', { name: /nouveau compteur/i }));
    fireEvent.change(await screen.findByRole('combobox', { name: 'Collaborateur' }), {
      target: { value: E1 },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compteur' }));
    await waitFor(() =>
      expect(gestion.actions.enregistrer).toHaveBeenCalledWith({
        id: undefined,
        employeId: E1,
        typeAbsenceId: CP,
        periodeDebut: '2026-04-01',
        periodeFin: '2027-03-31',
        droitsAcquis: '30.00',
        report: '0.00',
        notes: null,
      }),
    );
  });

  it('gestion : suppression avec confirmation', async () => {
    const gestion = creerGestion();
    render(<CompteursTable compteurs={[CP_MARC]} today={TODAY} gestion={gestion} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByText('Supprimer ce compteur ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(gestion.actions.supprimer).toHaveBeenCalledWith(C1));
  });
});
