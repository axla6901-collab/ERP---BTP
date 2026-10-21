import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CommentaireForm,
  EntretienForm,
  RefusForm,
} from '@/components/test-sirh/recrutement/candidature-formulaires';

const { refresh, toastSuccess } = vi.hoisted(() => ({ refresh: vi.fn(), toastSuccess: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, prefetch: vi.fn() }),
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

const ID = 'c1111111-1111-4111-8111-111111111111';
const ok = { ok: true as const, data: undefined };

/** Choisit une option d'un `OptionSelect` (Base UI) au clavier — fiable sous jsdom. */
async function choisirOption(nomListe: string, nomOption: string) {
  const declencheur = screen.getByRole('combobox', { name: nomListe });
  declencheur.focus();
  fireEvent.keyDown(declencheur, { key: 'ArrowDown' });
  const option = await screen.findByRole('option', { name: nomOption });
  option.focus();
  fireEvent.keyDown(option, { key: 'Enter' });
}

describe('EntretienForm', () => {
  it('planifie un entretien (date + heure de Paris)', async () => {
    const onPlanifier = vi.fn().mockResolvedValue(ok);
    render(<EntretienForm candidatureId={ID} dateEntretien={null} onPlanifier={onPlanifier} />);
    expect(screen.queryByRole('button', { name: 'Annuler l’entretien' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date de l’entretien'), {
      target: { value: '2026-10-20' },
    });
    fireEvent.change(screen.getByLabelText('Heure (Paris)'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Planifier' }));
    await waitFor(() =>
      expect(onPlanifier).toHaveBeenCalledWith({ id: ID, date: '2026-10-20', heure: '14:00' }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Entretien planifié'));
    // La server action revalide la page : pas de second rendu via router.refresh().
    expect(refresh).not.toHaveBeenCalled();
  });

  it('exige l’heure quand la date est saisie', async () => {
    const onPlanifier = vi.fn().mockResolvedValue(ok);
    render(<EntretienForm candidatureId={ID} dateEntretien={null} onPlanifier={onPlanifier} />);
    fireEvent.change(screen.getByLabelText('Date de l’entretien'), {
      target: { value: '2026-10-20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Planifier' }));
    expect(await screen.findByText('Heure de l’entretien requise.')).toBeInTheDocument();
    expect(onPlanifier).not.toHaveBeenCalled();
  });

  it('préremplit l’entretien existant (heure de Paris) et permet de l’annuler', async () => {
    const onPlanifier = vi.fn().mockResolvedValue(ok);
    render(
      <EntretienForm
        candidatureId={ID}
        dateEntretien="2026-10-20T12:00:00.000Z"
        onPlanifier={onPlanifier}
      />,
    );
    expect(screen.getByLabelText('Date de l’entretien')).toHaveValue('2026-10-20');
    expect(screen.getByLabelText('Heure (Paris)')).toHaveValue('14:00');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler l’entretien' }));
    await waitFor(() =>
      expect(onPlanifier).toHaveBeenCalledWith({ id: ID, date: null, heure: null }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Entretien annulé'));
  });
});

describe('CommentaireForm', () => {
  it('enregistre le commentaire de suivi', async () => {
    const onCommenter = vi.fn().mockResolvedValue(ok);
    render(<CommentaireForm candidatureId={ID} commentaire="Relancer" onCommenter={onCommenter} />);
    fireEvent.change(screen.getByLabelText('Commentaire de suivi'), {
      target: { value: 'Disponible au 1er novembre.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le commentaire' }));
    await waitFor(() =>
      expect(onCommenter).toHaveBeenCalledWith({
        id: ID,
        commentaire: 'Disponible au 1er novembre.',
      }),
    );
  });
});

describe('RefusForm', () => {
  it('refuse sans motif, puis envoie le motif choisi', async () => {
    const onRefuser = vi.fn().mockResolvedValue(ok);
    render(<RefusForm candidatureId={ID} onRefuser={onRefuser} onAnnuler={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le refus' }));
    expect(await screen.findByText('Motif de refus obligatoire.')).toBeInTheDocument();
    expect(onRefuser).not.toHaveBeenCalled();

    await choisirOption('Motif du refus', 'Prétentions salariales');
    fireEvent.change(screen.getByLabelText('Commentaire (facultatif)'), {
      target: { value: 'Écart de 400 € / mois.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le refus' }));
    await waitFor(() =>
      expect(onRefuser).toHaveBeenCalledWith({
        id: ID,
        motifRefus: 'pretentions_salariales',
        commentaire: 'Écart de 400 € / mois.',
      }),
    );
  });

  it('bouton Annuler', () => {
    const onAnnuler = vi.fn();
    render(<RefusForm candidatureId={ID} onRefuser={vi.fn()} onAnnuler={onAnnuler} />);
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onAnnuler).toHaveBeenCalled();
  });
});
