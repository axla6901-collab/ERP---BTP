import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AjoutCandidatureDialog } from '@/components/test-sirh/recrutement/ajout-candidature-dialog';

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

const OFFRE = '11111111-1111-4111-8111-111111111111';
const K1 = 'aaaaaaaa-1111-4111-8111-111111111111';

/** Choisit une option d'un `OptionSelect` (Base UI) au clavier — fiable sous jsdom. */
async function choisirOption(nomListe: string, nomOption: string) {
  const declencheur = screen.getByRole('combobox', { name: nomListe });
  declencheur.focus();
  fireEvent.keyDown(declencheur, { key: 'ArrowDown' });
  const option = await screen.findByRole('option', { name: nomOption });
  option.focus();
  fireEvent.keyDown(option, { key: 'Enter' });
}

function rendre(candidats = [{ id: K1, label: 'Durand Léa · lea@exemple.fr' }]) {
  const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'x', candidatId: K1 } });
  const onOpenChange = vi.fn();
  render(
    <AjoutCandidatureDialog
      open
      onOpenChange={onOpenChange}
      offreId={OFFRE}
      candidats={candidats}
      today="2026-10-19"
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onOpenChange };
}

describe('AjoutCandidatureDialog', () => {
  it('candidat du vivier : choix obligatoire puis ajout', async () => {
    const { onSubmit, onOpenChange } = rendre();
    expect(screen.getByRole('button', { name: 'Candidat du vivier' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au pipeline' }));
    expect(await screen.findByText('Choisissez un candidat.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await choisirOption('Candidat du vivier', 'Durand Léa · lea@exemple.fr');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au pipeline' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          offreId: OFFRE,
          mode: 'existant',
          candidatId: K1,
          dateCandidature: '2026-10-19',
        }),
      ),
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('création rapide : nom et prénom requis', async () => {
    const { onSubmit } = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Nouveau candidat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au pipeline' }));
    expect(await screen.findByText('Nom requis.')).toBeInTheDocument();
    expect(screen.getByText('Prénom requis.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Hugo' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Martin' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'hugo@exemple.fr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au pipeline' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'nouveau',
          nom: 'Martin',
          prenom: 'Hugo',
          email: 'hugo@exemple.fr',
          source: 'candidature_spontanee',
          consentementRgpd: false,
        }),
      ),
    );
  });

  it('vivier vide : création rapide proposée d’emblée', () => {
    rendre([]);
    expect(screen.getByRole('button', { name: 'Nouveau candidat' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Prénom')).toBeInTheDocument();
  });

  it('erreur serveur (doublon d’email) affichée sur le champ', async () => {
    const { onSubmit } = rendre([]);
    onSubmit.mockResolvedValueOnce({
      ok: false,
      error: 'Un candidat avec cet email existe déjà dans le vivier.',
      fieldErrors: { email: ['Un candidat avec cet email existe déjà dans le vivier.'] },
    });
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Léa' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Durand' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'lea@exemple.fr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter au pipeline' }));
    await waitFor(() =>
      expect(
        screen.getAllByText('Un candidat avec cet email existe déjà dans le vivier.'),
      ).toHaveLength(2),
    );
  });
});
