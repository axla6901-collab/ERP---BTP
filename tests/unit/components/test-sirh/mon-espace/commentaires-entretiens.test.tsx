import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CommentairesEntretiens,
  commentaireModifiable,
} from '@/components/test-sirh/mon-espace/commentaires-entretiens';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

describe('commentaireModifiable', () => {
  it('fermé une fois signé ou annulé', () => {
    expect(commentaireModifiable('planifie')).toBe(true);
    expect(commentaireModifiable('realise')).toBe(true);
    expect(commentaireModifiable('signe')).toBe(false);
    expect(commentaireModifiable('annule')).toBe(false);
  });
});

describe('CommentairesEntretiens', () => {
  it('enregistre le commentaire du salarié', async () => {
    const onEnregistrer = vi.fn().mockResolvedValue({ ok: true, data: { id: ID } });
    render(
      <CommentairesEntretiens
        onEnregistrer={onEnregistrer}
        entretiens={[
          {
            id: ID,
            typeEntretien: 'annuel',
            statut: 'realise',
            datePrevue: '2026-10-12',
            dateRealisation: '2026-10-14',
            commentaireSalarie: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('réalisé le 14/10/2026')).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: /enregistrer mon commentaire/i });
    expect(bouton).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Mon commentaire'), {
      target: { value: 'Je souhaite me former au CACES R482.' },
    });
    fireEvent.click(bouton);
    await waitFor(() =>
      expect(onEnregistrer).toHaveBeenCalledWith({
        id: ID,
        commentaireSalarie: 'Je souhaite me former au CACES R482.',
      }),
    );
  });

  it('lecture seule pour un entretien signé ; vide si tout est annulé', () => {
    const { rerender } = render(
      <CommentairesEntretiens
        onEnregistrer={vi.fn()}
        entretiens={[
          {
            id: ID,
            typeEntretien: 'professionnel',
            statut: 'signe',
            datePrevue: null,
            dateRealisation: '2026-09-01',
            commentaireSalarie: 'Entretien constructif.',
          },
        ]}
      />,
    );
    expect(screen.getByText('Entretien constructif.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    rerender(
      <CommentairesEntretiens
        onEnregistrer={vi.fn()}
        entretiens={[
          {
            id: ID,
            typeEntretien: 'annuel',
            statut: 'annule',
            datePrevue: null,
            dateRealisation: null,
            commentaireSalarie: null,
          },
        ]}
      />,
    );
    expect(screen.getByText(/aucun entretien/i)).toBeInTheDocument();
  });
});
