import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AbsencesListe,
  type DroitsListeAbsences,
} from '@/components/test-sirh/absences/absences-liste';
import type { AbsenceLigne } from '@/lib/test-sirh/absences/types';

import { installerPolyfillsJsdom } from './outils-tests';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(installerPolyfillsJsdom);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';
// UUID v4 valides : `decisionSchema` refuse un identifiant mal formé.
const A1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const A2 = '7a1d2e3f-4b5c-4d6e-8f70-1a2b3c4d5e6f';
const A3 = '0c9b8a7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d';
const A4 = '5e4d3c2b-1a09-4f8e-8d7c-6b5a49382716';

function absence(p: Partial<AbsenceLigne> & Pick<AbsenceLigne, 'id' | 'employe'>): AbsenceLigne {
  return {
    employeId: `emp-${p.id}`,
    matricule: null,
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
    motif: null,
    statut: 'en_attente',
    demandeParId: null,
    demandePar: null,
    valideur: null,
    dateDecision: null,
    commentaireDecision: null,
    justificatifDocumentId: null,
    createdAt: '2026-10-15T08:00:00.000Z',
    ...p,
  };
}

const ATTENTE = absence({ id: A1, employe: 'Marc Dubois', motif: 'Vacances' });
const MIENNE = absence({
  id: A2,
  employe: 'Léa Martin',
  employeId: 'moi',
  statut: 'approuvee',
  dateDebut: '2026-11-02',
  dateFin: '2026-11-03',
  duree: 2,
  valideur: 'rh@exemple.fr',
  dateDecision: '2026-10-16T09:30:00.000Z',
  commentaireDecision: 'Validé',
});
const REFUSEE = absence({
  id: A3,
  employe: 'Paul Bernard',
  statut: 'refusee',
  typeLibelle: 'RTT',
  unite: 'jours_ouvres',
  demiJourneeDebut: true,
  dateDebut: '2026-10-21',
  dateFin: '2026-10-21',
  duree: 0.5,
});

const VALIDEUR: DroitsListeAbsences = {
  peutValider: true,
  estGestionnaire: false,
  monEmployeId: 'moi',
  monUtilisateurId: 'u-moi',
};

function creerActions() {
  return {
    decider: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { statut: 'approuvee', avertissement: null } }),
    annuler: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

describe('AbsencesListe', () => {
  it('affiche type, période, durée, statut, décision et commentaires', () => {
    render(
      <AbsencesListe
        absences={[ATTENTE, MIENNE, REFUSEE]}
        today={TODAY}
        droits={VALIDEUR}
        actions={creerActions()}
      />,
    );
    expect(screen.getByText('Marc Dubois')).toBeInTheDocument();
    expect(screen.getByText('du 26/10/2026 au 30/10/2026')).toBeInTheDocument();
    expect(screen.getByText('le 21/10/2026 (après-midi)')).toBeInTheDocument();
    expect(screen.getByText('0,5 j')).toBeInTheDocument();
    expect(screen.getByText('En attente')).toBeInTheDocument();
    expect(screen.getByText('par rh@exemple.fr le 16/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Validé')).toBeInTheDocument();
    expect(screen.getByText('Vacances')).toBeInTheDocument();
  });

  it('boutons de décision réservés aux demandes en attente et aux valideurs', () => {
    const { unmount } = render(
      <AbsencesListe
        absences={[ATTENTE, REFUSEE]}
        today={TODAY}
        droits={VALIDEUR}
        actions={creerActions()}
      />,
    );
    expect(screen.getAllByRole('button', { name: /^Approuver$/ })).toHaveLength(1);
    unmount();
    render(
      <AbsencesListe
        absences={[ATTENTE]}
        today={TODAY}
        droits={{ ...VALIDEUR, peutValider: false }}
        actions={creerActions()}
      />,
    );
    expect(screen.queryByRole('button', { name: /^Approuver$/ })).not.toBeInTheDocument();
  });

  it('sa propre demande en attente ne se valide pas (hors gestion RH)', () => {
    render(
      <AbsencesListe
        absences={[absence({ id: A4, employe: 'Léa Martin', employeId: 'moi' })]}
        today={TODAY}
        droits={VALIDEUR}
        actions={creerActions()}
      />,
    );
    expect(screen.getByRole('button', { name: /^Approuver$/ })).toBeDisabled();
  });

  it('annulation : sa demande approuvée à venir, avec confirmation', async () => {
    const actions = creerActions();
    render(
      <AbsencesListe
        absences={[MIENNE, REFUSEE]}
        today={TODAY}
        droits={VALIDEUR}
        actions={actions}
      />,
    );
    // Seule l'absence approuvée à venir de l'utilisateur est annulable.
    const boutons = screen.getAllByRole('button', { name: 'Annuler' });
    expect(boutons).toHaveLength(1);
    fireEvent.click(boutons[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’annulation' }));
    await waitFor(() => expect(actions.annuler).toHaveBeenCalledWith(A2));
  });

  it('ouvre le dialogue de décision et transmet la décision', async () => {
    const actions = creerActions();
    render(
      <AbsencesListe absences={[ATTENTE]} today={TODAY} droits={VALIDEUR} actions={actions} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Refuser$/ }));
    expect(await screen.findByText('Refuser la demande')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Refuser' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() =>
      expect(actions.decider).toHaveBeenCalledWith({
        id: A1,
        decision: 'refuser',
        commentaire: null,
      }),
    );
  });

  it('masque la colonne collaborateur et affiche l’état vide', () => {
    const { unmount } = render(
      <AbsencesListe
        absences={[ATTENTE]}
        today={TODAY}
        droits={VALIDEUR}
        actions={{}}
        masquerEmploye
      />,
    );
    expect(screen.queryByText('Marc Dubois')).not.toBeInTheDocument();
    unmount();
    render(
      <AbsencesListe
        absences={[]}
        today={TODAY}
        droits={VALIDEUR}
        actions={{}}
        emptyMessage="Aucune absence."
      />,
    );
    expect(screen.getByText('Aucune absence.')).toBeInTheDocument();
  });
});
