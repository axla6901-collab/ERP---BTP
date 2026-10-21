import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ObjectifsSection,
  type ObjectifLigneUI,
} from '@/components/test-sirh/entretiens/objectifs-section';

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

const EMP = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const ENT = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const AUTRE = '11111111-1111-4111-8111-111111111111';
const O1 = '22222222-2222-4222-8222-222222222222';
const O2 = '33333333-3333-4333-8333-333333333333';

const objectifs: ObjectifLigneUI[] = [
  {
    id: O1,
    employeId: EMP,
    entretienId: ENT,
    entretienType: 'annuel',
    entretienDate: '2026-10-12',
    libelle: 'Obtenir le CACES R482',
    description: null,
    dateEcheance: '2026-09-30',
    poids: 60,
    progression: 50,
    statut: 'en_cours',
  },
  {
    id: O2,
    employeId: EMP,
    entretienId: AUTRE,
    entretienType: 'annuel',
    entretienDate: '2025-10-10',
    libelle: 'Former un apprenti',
    description: 'Tutorat sur chantier',
    dateEcheance: '2027-06-30',
    poids: 40,
    progression: 100,
    statut: 'atteint',
  },
];

function creerActions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: O1 } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

function rendre(
  props: Partial<{
    objectifs: ObjectifLigneUI[];
    peutGererTout: boolean;
    peutGererRattaches: boolean;
  }> = {},
  actions = creerActions(),
) {
  render(
    <ObjectifsSection
      objectifs={props.objectifs ?? objectifs}
      employeId={EMP}
      entretienId={ENT}
      peutGererTout={props.peutGererTout ?? true}
      peutGererRattaches={props.peutGererRattaches ?? false}
      today="2026-10-19"
      actions={actions}
    />,
  );
  return actions;
}

describe('ObjectifsSection', () => {
  it('affiche l’atteinte pondérée, les échéances dépassées et le rattachement', () => {
    rendre();
    expect(screen.getByText('70 %')).toBeInTheDocument();
    expect(screen.getByText('Échéance dépassée')).toBeInTheDocument();
    expect(screen.getByText('Cet entretien')).toBeInTheDocument();
    expect(screen.getByText('Annuel du 10/10/2025')).toBeInTheDocument();
    expect(screen.getByText('Tutorat sur chantier')).toBeInTheDocument();
    expect(screen.getByText('Atteint')).toBeInTheDocument();
  });

  it('évaluateur : ne gère que les objectifs rattachés à son entretien', () => {
    rendre({ peutGererTout: false, peutGererRattaches: true });
    expect(
      screen.getByRole('button', { name: 'Modifier Obtenir le CACES R482' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Modifier Former un apprenti' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nouvel objectif/i })).toBeInTheDocument();
  });

  it('lecture seule : aucune action', () => {
    rendre({ peutGererTout: false, peutGererRattaches: false });
    expect(screen.queryByRole('button', { name: /nouvel objectif/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('état vide', () => {
    rendre({ objectifs: [] });
    expect(screen.getByText('Aucun objectif.')).toBeInTheDocument();
  });

  it('crée un objectif rattaché à l’entretien', async () => {
    const actions = rendre({ objectifs: [], peutGererTout: false, peutGererRattaches: true });
    fireEvent.click(screen.getByRole('button', { name: /nouvel objectif/i }));
    fireEvent.change(await screen.findByLabelText('Libellé'), {
      target: { value: 'Réduire les retards de chantier' },
    });
    fireEvent.change(screen.getByLabelText('Progression (%)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Poids (%)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /créer l’objectif/i }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          employeId: EMP,
          entretienId: ENT,
          libelle: 'Réduire les retards de chantier',
          progression: 10,
          poids: 25,
          statut: 'en_cours',
        }),
      ),
    );
  });

  it('supprime un objectif après confirmation', async () => {
    const actions = rendre();
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]!);
    expect(screen.getByText('Supprimer cet objectif ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    // Le bouton de confirmation suit la question.
    fireEvent.click(boutons[0]!);
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith(O1));
  });
});
