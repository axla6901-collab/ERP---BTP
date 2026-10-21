import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PipelineOffre } from '@/components/test-sirh/recrutement/pipeline-offre';
import type { CandidatureOffre } from '@/lib/test-sirh/recrutement/queries';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
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

const BASE = '/acme/test-sirh';
const OFFRE = '11111111-1111-4111-8111-111111111111';
const UTILISATEUR = 'user-rh';
const C1 = 'c1111111-1111-4111-8111-111111111111';
const C2 = 'c2222222-2222-4222-8222-222222222222';
const C3 = 'c3333333-3333-4333-8333-333333333333';
const C4 = 'c4444444-4444-4444-8444-444444444444';
const C5 = 'c5555555-5555-4555-8555-555555555555';

function candidature(
  id: string,
  prenom: string,
  nom: string,
  etape: CandidatureOffre['etape'],
  extra: Partial<CandidatureOffre> = {},
): CandidatureOffre {
  return {
    id,
    offreId: OFFRE,
    candidatId: `k-${id}`,
    nom,
    prenom,
    email: null,
    telephone: null,
    source: 'france_travail',
    employeId: null,
    etape,
    dateCandidature: '2026-10-01',
    note: null,
    motifRefus: null,
    dateEntretien: null,
    commentaire: null,
    avis: [],
    ...extra,
  };
}

const candidatures: CandidatureOffre[] = [
  candidature(C1, 'Léa', 'Durand', 'nouvelle', { note: 4 }),
  candidature(C2, 'Hugo', 'Martin', 'entretien_rh', {
    dateEntretien: '2026-10-20T12:00:00.000Z',
    avis: [
      {
        id: 'a1',
        candidatureId: C2,
        auteurId: UTILISATEUR,
        auteurLibelle: 'rh@acme.fr',
        note: 4,
        avis: 'favorable',
        commentaire: 'Bon profil chantier.',
        createdAt: '2026-10-15T09:00:00.000Z',
      },
      {
        id: 'a2',
        candidatureId: C2,
        auteurId: 'autre',
        auteurLibelle: 'conducteur@acme.fr',
        note: null,
        avis: 'reserve',
        commentaire: null,
        createdAt: '2026-10-16T09:00:00.000Z',
      },
    ],
  }),
  candidature(C3, 'Inès', 'Petit', 'proposition'),
  candidature(C4, 'Paul', 'Roux', 'refusee', { motifRefus: 'experience_insuffisante' }),
  candidature(C5, 'Zoé', 'Blanc', 'embauche', { employeId: 'emp-5' }),
];

function actionsMock() {
  const ok = { ok: true as const, data: undefined };
  return {
    deplacer: vi.fn().mockResolvedValue(ok),
    refuser: vi.fn().mockResolvedValue(ok),
    desister: vi.fn().mockResolvedValue(ok),
    rouvrir: vi.fn().mockResolvedValue(ok),
    planifierEntretien: vi.fn().mockResolvedValue(ok),
    noter: vi.fn().mockResolvedValue(ok),
    commenter: vi.fn().mockResolvedValue(ok),
    retirer: vi.fn().mockResolvedValue(ok),
    ajouterAvis: vi.fn().mockResolvedValue({ ok: true, data: { id: 'a3' } }),
    supprimerAvis: vi.fn().mockResolvedValue(ok),
    embaucher: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { employeId: 'emp-3', offrePourvue: false } }),
  };
}

function rendre(peutGerer: boolean, actions = actionsMock()) {
  render(
    <PipelineOffre
      candidatures={candidatures}
      typeContratOffre="cdi"
      base={BASE}
      today="2026-10-19"
      peutGerer={peutGerer}
      utilisateurId={UTILISATEUR}
      actions={actions}
    />,
  );
  return actions;
}

describe('PipelineOffre', () => {
  it('répartit les candidatures en colonnes et en volet « Clôturées »', () => {
    rendre(true);
    const nouvelle = screen.getByRole('region', { name: 'Étape Nouvelle' });
    expect(within(nouvelle).getByText('Léa Durand')).toBeInTheDocument();
    const entretienRh = screen.getByRole('region', { name: 'Étape Entretien RH' });
    expect(within(entretienRh).getByText('Hugo Martin')).toBeInTheDocument();
    expect(within(entretienRh).getByText(/Entretien le 20\/10\/2026 à 14:00/)).toBeInTheDocument();
    expect(within(entretienRh).getByText('2 avis')).toBeInTheDocument();
    expect(screen.getAllByText('Aucune candidature')).toHaveLength(2);
    expect(screen.getByText('Clôturées (2)')).toBeInTheDocument();
    expect(screen.getByText('Motif : Expérience insuffisante')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zoé Blanc' })).toHaveAttribute(
      'href',
      `${BASE}/recrutement/candidats/k-${C5}`,
    );
  });

  it('étape suivante / précédente depuis la carte', async () => {
    const actions = rendre(true);
    fireEvent.click(screen.getByRole('button', { name: 'Passer à l’étape Présélection' }));
    await waitFor(() =>
      expect(actions.deplacer).toHaveBeenCalledWith({ id: C1, etape: 'preselection' }),
    );
    // Les boutons restent désactivés pendant l'action en cours.
    const retour = screen.getByRole('button', { name: 'Revenir à l’étape Présélection' });
    await waitFor(() => expect(retour).toBeEnabled());
    fireEvent.click(retour);
    await waitFor(() =>
      expect(actions.deplacer).toHaveBeenCalledWith({ id: C2, etape: 'preselection' }),
    );
    expect(screen.getByRole('button', { name: 'Première étape du pipeline' })).toBeDisabled();
  });

  it('en fin de pipeline, « Embaucher » ouvre la confirmation d’embauche', () => {
    rendre(true);
    const proposition = screen.getByRole('region', { name: 'Étape Proposition' });
    fireEvent.click(within(proposition).getByRole('button', { name: 'Embaucher' }));
    expect(screen.getByText('Embaucher Inès Petit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer l’embauche' })).toBeInTheDocument();
  });

  it('lecture seule : pas de déplacement ni d’embauche, mais accès aux détails', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /Passer à l’étape/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Embaucher' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Détails de la candidature/ })).toHaveLength(5);
  });

  it('les détails affichent les avis et permettent d’en ajouter (lecteur)', async () => {
    const actions = rendre(false);
    fireEvent.click(
      screen.getByRole('button', { name: 'Détails de la candidature de Hugo Martin' }),
    );
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByText('Avis des évaluateurs (2)')).toBeInTheDocument();
    expect(within(dialogue).getByText('Bon profil chantier.')).toBeInTheDocument();
    expect(within(dialogue).getByText(/conducteur@acme\.fr/)).toBeInTheDocument();
    // Pas d'actions de gestion pour un lecteur.
    expect(within(dialogue).queryByRole('button', { name: 'Refuser…' })).not.toBeInTheDocument();

    fireEvent.click(within(dialogue).getByRole('button', { name: 'Favorable' }));
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Ajouter mon avis' }));
    await waitFor(() =>
      expect(actions.ajouterAvis).toHaveBeenCalledWith({
        candidatureId: C2,
        note: null,
        avis: 'favorable',
        commentaire: null,
      }),
    );
  });

  it('refus depuis les détails : motif obligatoire', async () => {
    const actions = rendre(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Détails de la candidature de Léa Durand' }),
    );
    const dialogue = await screen.findByRole('dialog');
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Refuser…' }));
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Confirmer le refus' }));
    await waitFor(() =>
      expect(within(dialogue).getByText('Motif de refus obligatoire.')).toBeInTheDocument(),
    );
    expect(actions.refuser).not.toHaveBeenCalled();
  });

  it('candidature close : réouverture proposée, embauche avec liens RH', async () => {
    rendre(true);
    fireEvent.click(screen.getByRole('button', { name: 'Détails de la candidature de Paul Roux' }));
    const refus = await screen.findByRole('dialog');
    expect(within(refus).getByText('Motif du refus : Expérience insuffisante')).toBeInTheDocument();
    expect(within(refus).getByRole('button', { name: 'Rouvrir' })).toBeDisabled();
    fireEvent.click(within(refus).getByRole('button', { name: 'Fermer' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Détails de la candidature de Zoé Blanc' }));
    const embauche = await screen.findByRole('dialog');
    expect(within(embauche).getByRole('link', { name: 'Dossier collaborateur' })).toHaveAttribute(
      'href',
      `${BASE}/collaborateurs/emp-5`,
    );
    expect(within(embauche).queryByRole('button', { name: 'Rouvrir' })).not.toBeInTheDocument();
  });
});
