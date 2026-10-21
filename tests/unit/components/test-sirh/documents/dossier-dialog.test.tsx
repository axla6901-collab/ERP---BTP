import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DossierDialog } from '@/components/test-sirh/documents/dossier-dialog';
import { DossierCourantBandeau } from '@/components/test-sirh/documents/dossiers-gestion';

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

const DOSSIER = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

describe('DossierDialog', () => {
  it('crée un dossier (ordre converti en nombre)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: DOSSIER } });
    render(
      <DossierDialog open onOpenChange={vi.fn()} dossier={{ ordre: 90 }} onSubmit={onSubmit} />,
    );
    expect(screen.getByLabelText('Ordre')).toHaveValue(90);
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Mutuelle & prévoyance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le dossier' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ nom: 'Mutuelle & prévoyance', ordre: 90, visibleSalarie: false }),
      ),
    );
  });

  it('affiche le refus d’unicité renvoyé par le serveur', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Un dossier porte déjà ce nom.',
      fieldErrors: { nom: ['Un dossier porte déjà ce nom.'] },
    });
    render(<DossierDialog open onOpenChange={vi.fn()} dossier={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Divers' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le dossier' }));
    await waitFor(() =>
      expect(screen.getAllByText('Un dossier porte déjà ce nom.')).toHaveLength(2),
    );
  });
});

describe('DossierCourantBandeau', () => {
  const dossier = {
    id: DOSSIER,
    nom: 'Médecine du travail',
    description: 'Fiches d’aptitude',
    visibleSalarie: false,
    ordre: 60,
    nbDocuments: 3,
  };
  const actions = {
    enregistrer: vi.fn(),
    supprimer: vi.fn().mockResolvedValue({
      ok: false,
      error: 'Suppression impossible : ce dossier est référencé par 3 documents.',
    }),
  };

  it('présente le dossier et propose la gestion aux RH', async () => {
    render(
      <DossierCourantBandeau
        dossier={dossier}
        peutGerer
        actions={actions}
        urlApresSuppression="/acme/test-sirh/documents"
      />,
    );
    expect(screen.getByText('Médecine du travail')).toBeInTheDocument();
    expect(screen.getByText('RH uniquement')).toBeInTheDocument();
    expect(screen.getByText('3 documents')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' }).at(-1)!);
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith(DOSSIER));
  });

  it('sans droit de gestion : aucune action', () => {
    render(
      <DossierCourantBandeau
        dossier={dossier}
        peutGerer={false}
        actions={actions}
        urlApresSuppression="/acme/test-sirh/documents"
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });
});
