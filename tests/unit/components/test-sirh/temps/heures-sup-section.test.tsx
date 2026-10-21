import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  HeuresSupSection,
  type HeuresSupLigne,
} from '@/components/test-sirh/temps/heures-sup-section';

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

const MOI = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const AUTRE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f71';
const H1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f81';

function ligne(p: Partial<HeuresSupLigne> & Pick<HeuresSupLigne, 'id'>): HeuresSupLigne {
  return {
    employeId: AUTRE,
    employeNom: 'Durand',
    employePrenom: 'Léa',
    matricule: null,
    dateHeures: '2026-10-12',
    dureeHeures: 2,
    majorationPct: 25,
    compensation: 'paiement',
    motif: null,
    chantierLabel: null,
    statut: 'en_attente',
    valideurEmail: null,
    dateDecision: null,
    commentaireDecision: null,
    ...p,
  };
}

const demandes: HeuresSupLigne[] = [
  ligne({ id: H1 }),
  ligne({ id: 'h2', employeId: MOI, employeNom: 'Martin', employePrenom: 'Paul' }),
  ligne({
    id: 'h3',
    statut: 'approuvee',
    majorationPct: 50,
    valideurEmail: 'rh@exemple.fr',
    dateDecision: '2026-10-14T09:30:00.000Z',
    commentaireDecision: 'OK chantier',
  }),
];

function actions() {
  return {
    demander: vi.fn().mockResolvedValue({ ok: true, data: { id: 'n' } }),
    decider: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    annuler: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

const communs = {
  today: '2026-10-19',
  employes: [],
  chantiers: [],
};

describe('HeuresSupSection', () => {
  it('affiche les demandes, leur majoration et la décision', () => {
    render(
      <HeuresSupSection
        {...communs}
        demandes={demandes}
        peutValider={false}
        peutGerer={false}
        monEmployeId={null}
        employeFixe={null}
        actions={actions()}
      />,
    );
    expect(screen.getAllByText('Durand Léa')).toHaveLength(2);
    expect(screen.getByText('+50 %')).toBeInTheDocument();
    expect(screen.getAllByText('En attente')).toHaveLength(2);
    expect(screen.getByText('Approuvée')).toBeInTheDocument();
    // 09:30 UTC = 11:30 heure de Paris (heure d'été).
    expect(screen.getByText('14/10/2026 11:30 · rh@exemple.fr')).toBeInTheDocument();
    expect(screen.getByText('« OK chantier »')).toBeInTheDocument();
    // Ni valideur ni fiche employé : aucune action.
    expect(screen.queryByRole('button', { name: 'Approuver' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nouvelle demande/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
  });

  it('valideur : décide des demandes des autres, pas des siennes', () => {
    render(
      <HeuresSupSection
        {...communs}
        demandes={demandes}
        peutValider
        peutGerer={false}
        monEmployeId={MOI}
        employeFixe={null}
        actions={actions()}
      />,
    );
    // h1 seulement (h2 = sa propre demande, h3 déjà approuvée).
    expect(screen.getAllByRole('button', { name: 'Approuver' })).toHaveLength(1);
    // Annulation : h1, h2 (en attente) et h3 (approuvée, valideur).
    expect(screen.getAllByRole('button', { name: 'Annuler' })).toHaveLength(3);
    expect(screen.getByRole('button', { name: /nouvelle demande/i })).toBeInTheDocument();
  });

  it('libre-service : annule sa demande en attente', async () => {
    const a = actions();
    render(
      <HeuresSupSection
        {...communs}
        demandes={[demandes[1]!]}
        peutValider={false}
        peutGerer={false}
        monEmployeId={MOI}
        employeFixe={{ id: MOI, label: 'Martin Paul' }}
        actions={a}
        masquerCollaborateur
      />,
    );
    expect(screen.queryByText('Collaborateur')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’annulation' }));
    await waitFor(() => expect(a.annuler).toHaveBeenCalledWith('h2'));
  });

  it('ouvre la décision depuis la liste', async () => {
    const a = actions();
    render(
      <HeuresSupSection
        {...communs}
        demandes={[demandes[0]!]}
        peutValider
        peutGerer
        monEmployeId={MOI}
        employeFixe={null}
        actions={a}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    expect(await screen.findByText('Refuser la demande')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Refuser' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() =>
      expect(a.decider).toHaveBeenCalledWith({ id: H1, decision: 'refuser', commentaire: null }),
    );
  });

  it('affiche l’état vide', () => {
    render(
      <HeuresSupSection
        {...communs}
        demandes={[]}
        peutValider
        peutGerer
        monEmployeId={null}
        employeFixe={null}
        actions={actions()}
        emptyMessage="Rien ce mois-ci."
      />,
    );
    expect(screen.getByText('Rien ce mois-ci.')).toBeInTheDocument();
  });
});
