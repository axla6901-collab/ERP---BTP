import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AbsencesValidationListe } from '@/components/test-sirh/absences/absences-validation-liste';
import type { AbsenceEnAttente } from '@/lib/test-sirh/absences/types';

import { installerPolyfillsJsdom } from './outils-tests';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { toast } from 'sonner';

beforeAll(installerPolyfillsJsdom);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ABS_1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const ABS_2 = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';

const DEMANDE: AbsenceEnAttente = {
  id: ABS_1,
  employeId: 'e1',
  employe: 'Marc Dubois',
  matricule: 'M001',
  typeAbsenceId: 'cp',
  typeCode: 'CP',
  typeLibelle: 'Congés payés',
  couleur: '#f59e0b',
  unite: 'jours_ouvrables',
  categorie: 'conges',
  avecSolde: true,
  dateDebut: '2026-10-26',
  dateFin: '2026-10-30',
  demiJourneeDebut: false,
  demiJourneeFin: false,
  duree: 6,
  motif: 'Vacances scolaires',
  statut: 'en_attente',
  demandeParId: 'u1',
  demandePar: 'marc@exemple.fr',
  valideur: null,
  dateDecision: null,
  commentaireDecision: null,
  justificatifDocumentId: null,
  createdAt: '2026-10-15T08:00:00.000Z',
  estPropreDemande: false,
  soldeAvant: 4,
  soldeApres: -2,
};

const PROPRE: AbsenceEnAttente = {
  ...DEMANDE,
  id: ABS_2,
  employeId: 'moi',
  employe: 'Léa Martin',
  motif: null,
  avecSolde: false,
  soldeAvant: null,
  soldeApres: null,
  estPropreDemande: true,
};

function creerActions(avertissement: string | null = null) {
  return {
    decider: vi.fn().mockResolvedValue({
      ok: true,
      data: { statut: 'approuvee', avertissement },
    }),
  };
}

describe('AbsencesValidationListe', () => {
  it('affiche la demande : période, durée, solde avant / après, motif, demandeur', () => {
    render(<AbsencesValidationListe absences={[DEMANDE]} actions={creerActions()} />);
    expect(screen.getByText('Marc Dubois')).toBeInTheDocument();
    expect(screen.getByText('Congés payés')).toBeInTheDocument();
    const ligne = screen.getByTestId('absence-en-attente');
    expect(ligne).toHaveTextContent('du 26/10/2026 au 30/10/2026');
    expect(ligne).toHaveTextContent('6 j');
    expect(ligne).toHaveTextContent('Solde : 4 j → -2 j après validation');
    expect(ligne).toHaveTextContent('« Vacances scolaires »');
    expect(ligne).toHaveTextContent('Demandée le 15/10/2026 par marc@exemple.fr');
  });

  it('affiche l’état vide', () => {
    render(<AbsencesValidationListe absences={[]} actions={creerActions()} />);
    expect(screen.getByText('Aucune demande d’absence en attente.')).toBeInTheDocument();
  });

  it('un valideur ne décide pas sa propre demande, un gestionnaire RH si', () => {
    const { unmount } = render(
      <AbsencesValidationListe absences={[PROPRE]} actions={creerActions()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Approuver la demande de Léa Martin' }),
    ).toBeDisabled();
    expect(screen.getByText(/votre propre demande/)).toBeInTheDocument();
    unmount();
    render(
      <AbsencesValidationListe absences={[PROPRE]} estGestionnaire actions={creerActions()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Approuver la demande de Léa Martin' }),
    ).toBeEnabled();
  });

  it('approuve avec un commentaire et relaie l’avertissement de solde', async () => {
    const actions = creerActions('Solde insuffisant : 4 j disponible(s).');
    render(<AbsencesValidationListe absences={[DEMANDE]} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approuver la demande de Marc Dubois' }));
    expect(await screen.findByText('Approuver la demande')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Commentaire (facultatif)'), {
      target: { value: 'Bonnes vacances' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Approuver' }));
    await waitFor(() =>
      expect(actions.decider).toHaveBeenCalledWith({
        id: ABS_1,
        decision: 'approuver',
        commentaire: 'Bonnes vacances',
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Demande approuvée');
    expect(toast.warning).toHaveBeenCalledWith('Solde insuffisant : 4 j disponible(s).');
  });

  it('refuse sans commentaire (commentaire null)', async () => {
    const actions = {
      decider: vi.fn().mockResolvedValue({
        ok: true,
        data: { statut: 'refusee', avertissement: null },
      }),
    };
    render(<AbsencesValidationListe absences={[DEMANDE]} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser la demande de Marc Dubois' }));
    expect(await screen.findByText('Refuser la demande')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    await waitFor(() =>
      expect(actions.decider).toHaveBeenCalledWith({
        id: ABS_1,
        decision: 'refuser',
        commentaire: null,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('Demande refusée');
  });

  it('affiche le refus du serveur dans le dialogue', async () => {
    const actions = {
      decider: vi.fn().mockResolvedValue({ ok: false, error: 'Cette demande a été annulée.' }),
    };
    render(<AbsencesValidationListe absences={[DEMANDE]} actions={actions} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approuver la demande de Marc Dubois' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approuver' }));
    expect(await screen.findByText('Cette demande a été annulée.')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
