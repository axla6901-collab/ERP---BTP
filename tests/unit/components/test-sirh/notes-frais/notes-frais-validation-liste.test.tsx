import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NotesFraisValidationListe } from '@/components/test-sirh/notes-frais/notes-frais-validation-liste';

import { EMPLOYE_2, ligneNoteFrais } from './fixtures';

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

const NOTE_ID = '5c8e1a2b-3d4f-4a6b-9c7d-8e9f0a1b2c3d';

const notes = [
  ligneNoteFrais({
    id: NOTE_ID,
    employeId: EMPLOYE_2,
    employeNom: 'Julie Martin',
    libelle: 'Hôtel Lyon',
    montantTtc: 89,
    justificatifDocumentId: '7d9e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f4a',
    justificatifTitre: 'Facture hôtel',
    droits: { decider: true } as never,
  }),
  ligneNoteFrais({
    id: 'moi',
    employeNom: 'Moi Même',
    libelle: 'Péage',
    montantTtc: 11,
    droits: { decider: false } as never,
  }),
];

function actions() {
  return {
    decider: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    urlTelechargement: vi.fn(),
  };
}

describe('NotesFraisValidationListe', () => {
  it('liste les notes en attente avec le total', () => {
    render(<NotesFraisValidationListe notes={notes} actions={actions()} />);
    expect(screen.getByText('Julie Martin')).toBeInTheDocument();
    expect(screen.getByText('2 notes en attente')).toBeInTheDocument();
    expect(screen.getByText('100,00 €')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Facture hôtel' })).toBeInTheDocument();
  });

  it('désactive la décision sur sa propre note', () => {
    render(<NotesFraisValidationListe notes={notes} actions={actions()} />);
    expect(screen.getByRole('button', { name: 'Approuver la note de Moi Même' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approuver la note de Julie Martin' })).toBeEnabled();
  });

  it('approuve une note avec un commentaire facultatif', async () => {
    const a = actions();
    render(<NotesFraisValidationListe notes={notes} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approuver la note de Julie Martin' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approuver' }));
    await waitFor(() =>
      expect(a.decider).toHaveBeenCalledWith({
        id: NOTE_ID,
        decision: 'approuver',
        commentaire: null,
      }),
    );
  });

  it('exige un motif de refus', async () => {
    const a = actions();
    render(<NotesFraisValidationListe notes={notes} actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser la note de Julie Martin' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Refuser' }));
    expect(await screen.findByText(/indiquez le motif du refus/i)).toBeInTheDocument();
    expect(a.decider).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Motif du refus'), {
      target: { value: 'Pas de justificatif lisible' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    await waitFor(() =>
      expect(a.decider).toHaveBeenCalledWith({
        id: NOTE_ID,
        decision: 'refuser',
        commentaire: 'Pas de justificatif lisible',
      }),
    );
  });

  it('affiche l’état vide', () => {
    render(<NotesFraisValidationListe notes={[]} actions={actions()} />);
    expect(screen.getByText(/aucune note de frais en attente/i)).toBeInTheDocument();
  });
});
