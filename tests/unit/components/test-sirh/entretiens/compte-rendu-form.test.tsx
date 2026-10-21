import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CompteRenduForm } from '@/components/test-sirh/entretiens/compte-rendu-form';
import type { CompteRenduInput } from '@/lib/validation/test-sirh/entretiens';

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

const E1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

const valeurs: CompteRenduInput = {
  id: E1,
  statut: 'planifie',
  datePrevue: '2026-10-25',
  dateRealisation: null,
  noteGlobale: null,
  synthese: null,
  pointsForts: null,
  axesAmelioration: null,
  souhaitsFormation: null,
  souhaitsEvolution: null,
  commentaireSalarie: null,
};

/** Choisit une option d'un `OptionSelect` (Base UI) au clavier — fiable sous jsdom. */
async function choisirOption(nomListe: string, nomOption: string) {
  const declencheur = screen.getByRole('combobox', { name: nomListe });
  declencheur.focus();
  fireEvent.keyDown(declencheur, { key: 'ArrowDown' });
  const option = await screen.findByRole('option', { name: nomOption });
  option.focus();
  fireEvent.keyDown(option, { key: 'Enter' });
}

describe('CompteRenduForm', () => {
  it('soumet le compte rendu saisi', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: E1 } });
    render(
      <CompteRenduForm valeurs={valeurs} statutActuel="planifie" modifiable onSubmit={onSubmit} />,
    );
    fireEvent.change(screen.getByLabelText('Synthèse de l’entretien'), {
      target: { value: 'Très bonne année sur le chantier.' },
    });
    fireEvent.change(screen.getByLabelText('Souhaits de formation'), {
      target: { value: 'CACES R482' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer le compte rendu/i }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          id: E1,
          statut: 'planifie',
          synthese: 'Très bonne année sur le chantier.',
          souhaitsFormation: 'CACES R482',
          pointsForts: null,
        }),
      ),
    );
  });

  it('ne propose que les statuts accessibles depuis le statut courant', async () => {
    render(
      <CompteRenduForm valeurs={valeurs} statutActuel="planifie" modifiable onSubmit={vi.fn()} />,
    );
    const declencheur = screen.getByRole('combobox', { name: 'Statut de l’entretien' });
    declencheur.focus();
    fireEvent.keyDown(declencheur, { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: 'Réalisé' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Annulé' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Signé' })).not.toBeInTheDocument();
  });

  it('exige la date de réalisation pour passer « Réalisé »', async () => {
    const onSubmit = vi.fn();
    render(
      <CompteRenduForm valeurs={valeurs} statutActuel="planifie" modifiable onSubmit={onSubmit} />,
    );
    await choisirOption('Statut de l’entretien', 'Réalisé');
    fireEvent.click(screen.getByRole('button', { name: /enregistrer le compte rendu/i }));
    expect(await screen.findByText(/date de réalisation requise/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('affiche l’erreur serveur', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'Seuls la RH et l’évaluateur peuvent modifier.' });
    render(
      <CompteRenduForm valeurs={valeurs} statutActuel="planifie" modifiable onSubmit={onSubmit} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enregistrer le compte rendu/i }));
    expect(await screen.findByText(/seuls la rh et l’évaluateur/i)).toBeInTheDocument();
  });

  it('lecture seule : champs désactivés et motif affiché', () => {
    render(
      <CompteRenduForm
        valeurs={{ ...valeurs, statut: 'signe', dateRealisation: '2026-10-01', synthese: 'RAS' }}
        statutActuel="signe"
        modifiable={false}
        motifLectureSeule="Entretien signé : le compte rendu est verrouillé."
        onSubmit={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/entretien signé : le compte rendu est verrouillé/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Synthèse de l’entretien')).toBeDisabled();
    expect(screen.getByLabelText('Synthèse de l’entretien')).toHaveValue('RAS');
    expect(screen.queryByRole('button', { name: /enregistrer/i })).not.toBeInTheDocument();
  });
});
