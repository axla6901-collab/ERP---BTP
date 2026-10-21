import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  DemandeAbsenceDialog,
  valeursDemandeParDefaut,
  type ActionsDemandeAbsence,
} from '@/components/test-sirh/absences/demande-absence-dialog';
import type { ContexteDemandeAbsence } from '@/lib/test-sirh/absences/types';

import type * as ModuleOptionSelect from '@/components/test-sirh/option-select';

import { installerPolyfillsJsdom } from './outils-tests';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
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

const EMPLOYE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const EMPLOYE_2 = '4a2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f71';
const CP = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const MAL = '0c9b8a7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const INT = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382716';
const TODAY = '2026-10-19'; // lundi

const CONTEXTE: ContexteDemandeAbsence = {
  types: [
    {
      id: CP,
      code: 'CP',
      label: 'Congés payés (CP)',
      couleur: '#f59e0b',
      uniteDecompte: 'jours_ouvrables',
      avecSolde: true,
      justificatifRequis: false,
      necessiteValidation: true,
    },
    {
      id: MAL,
      code: 'MAL',
      label: 'Arrêt maladie (MAL)',
      couleur: '#ef4444',
      uniteDecompte: 'jours_calendaires',
      avecSolde: false,
      justificatifRequis: true,
      necessiteValidation: false,
    },
    {
      id: INT,
      code: 'INT',
      label: 'Intempéries (INT)',
      couleur: '#64748b',
      uniteDecompte: 'heures',
      avecSolde: false,
      justificatifRequis: false,
      necessiteValidation: false,
    },
  ],
  employes: [{ id: EMPLOYE, label: 'Dubois Marc', siteId: null }],
  feries: [{ date: '2026-11-11', siteId: null }],
  soldes: [
    {
      employeId: EMPLOYE,
      typeAbsenceId: CP,
      periodeDebut: '2026-04-01',
      periodeFin: '2027-03-31',
      solde: 5,
      soldePrevisionnel: 5,
    },
  ],
  dossierJustificatifsId: null,
};

function creerActions(
  resultat: Awaited<ReturnType<ActionsDemandeAbsence['demander']>> = {
    ok: true,
    data: { id: 'abs-1', statut: 'en_attente', duree: 6, avertissement: null },
  },
) {
  return {
    demander: vi.fn().mockResolvedValue(resultat),
    televersement: { preparerUpload: vi.fn(), creerDocument: vi.fn() },
  };
}

function rendre(
  actions = creerActions(),
  props: Partial<Parameters<typeof DemandeAbsenceDialog>[0]> = {},
) {
  render(
    <DemandeAbsenceDialog
      open
      onOpenChange={vi.fn()}
      contexte={CONTEXTE}
      today={TODAY}
      employeFixeId={EMPLOYE}
      actions={actions}
      {...props}
    />,
  );
  return actions;
}

const duree = () => screen.getByTestId('duree-calculee');
const changer = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('valeursDemandeParDefaut', () => {
  it('renseigne toutes les clés et corrige une fin antérieure au début', () => {
    expect(
      valeursDemandeParDefaut({
        employeId: EMPLOYE,
        typeAbsenceId: CP,
        dateDebut: '2026-10-20',
        dateFin: '2026-10-19',
      }),
    ).toEqual({
      employeId: EMPLOYE,
      typeAbsenceId: CP,
      dateDebut: '2026-10-20',
      dateFin: '2026-10-20',
      demiJourneeDebut: false,
      demiJourneeFin: false,
      dureeHeures: null,
      motif: null,
      justificatifDocumentId: null,
      approuverDirectement: false,
    });
  });
});

describe('DemandeAbsenceDialog', () => {
  it('affiche le collaborateur imposé et calcule la durée en direct (jours ouvrables)', async () => {
    rendre();
    expect(screen.getByText('Dubois Marc')).toBeInTheDocument();
    expect(duree()).toHaveTextContent('Durée décomptée : 1 j');

    changer('Au', '2026-10-23');
    // Lundi → vendredi = 5 j + samedi final = 6 j ouvrables.
    await waitFor(() => expect(duree()).toHaveTextContent('Durée décomptée : 6 j'));
    expect(screen.getByTestId('solde-indicatif')).toHaveTextContent('5 j');
    expect(duree()).toHaveTextContent('Solde insuffisant');
  });

  it('demi-journée sur un seul jour : le matin vaut 0,5 j', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Matin' }));
    await waitFor(() => expect(duree()).toHaveTextContent('Durée décomptée : 0,5 j'));
  });

  it('exclut les jours fériés chômés du décompte', async () => {
    rendre();
    changer('Du', '2026-11-09');
    changer('Au', '2026-11-13');
    // 9, 10, 12, 13 novembre (11 = férié) + samedi 14 = 5 j ouvrables.
    await waitFor(() => expect(duree()).toHaveTextContent('Durée décomptée : 5 j'));
  });

  it('envoie la demande complète et relaie l’avertissement de solde', async () => {
    const actions = rendre(
      creerActions({
        ok: true,
        data: {
          id: 'abs-1',
          statut: 'en_attente',
          duree: 6,
          avertissement: 'Solde insuffisant : 5 j disponible(s).',
        },
      }),
    );
    changer('Au', '2026-10-23');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la demande' }));
    await waitFor(() =>
      expect(actions.demander).toHaveBeenCalledWith({
        employeId: EMPLOYE,
        typeAbsenceId: CP,
        dateDebut: '2026-10-19',
        dateFin: '2026-10-23',
        demiJourneeDebut: false,
        demiJourneeFin: false,
        dureeHeures: null,
        motif: null,
        justificatifDocumentId: null,
        approuverDirectement: false,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Demande d’absence envoyée pour validation');
    expect(toast.warning).toHaveBeenCalledWith('Solde insuffisant : 5 j disponible(s).');
  });

  it('bloque l’envoi sans justificatif pour un type qui l’exige', async () => {
    const actions = rendre();
    fireEvent.change(screen.getByRole('combobox', { name: 'Type d’absence' }), {
      target: { value: MAL },
    });
    expect(await screen.findByText(/ne nécessite pas de validation/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la demande' }));
    expect(
      await screen.findByText('Justificatif obligatoire pour ce type d’absence.'),
    ).toBeInTheDocument();
    expect(actions.demander).not.toHaveBeenCalled();
  });

  it('unité heures : durée saisie puis transmise', async () => {
    const actions = rendre();
    fireEvent.change(screen.getByRole('combobox', { name: 'Type d’absence' }), {
      target: { value: INT },
    });
    await waitFor(() => expect(duree()).toHaveTextContent('Saisissez la durée en heures.'));
    changer('Durée (heures)', '3,5');
    await waitFor(() => expect(duree()).toHaveTextContent('Durée décomptée : 3 h 30'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la demande' }));
    await waitFor(() =>
      expect(actions.demander).toHaveBeenCalledWith(
        expect.objectContaining({
          typeAbsenceId: INT,
          dureeHeures: '3.50',
          demiJourneeDebut: false,
          demiJourneeFin: false,
        }),
      ),
    );
  });

  it('affiche l’erreur renvoyée par le serveur', async () => {
    rendre(
      creerActions({
        ok: false,
        error: 'Chevauchement avec une absence approuvée le 19/10/2026.',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la demande' }));
    expect(
      await screen.findByText('Chevauchement avec une absence approuvée le 19/10/2026.'),
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('gestionnaire : choix du collaborateur et approbation directe', async () => {
    const actions = rendre(creerActions(), {
      employeFixeId: null,
      peutApprouverDirectement: true,
      contexte: {
        ...CONTEXTE,
        employes: [...CONTEXTE.employes, { id: EMPLOYE_2, label: 'Martin Léa', siteId: null }],
      },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Collaborateur' }), {
      target: { value: EMPLOYE_2 },
    });
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la demande' }));
    await waitFor(() =>
      expect(actions.demander).toHaveBeenCalledWith(
        expect.objectContaining({ employeId: EMPLOYE_2, approuverDirectement: true }),
      ),
    );
  });
});
