import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevisEditor } from '@/components/commercial/devis-editor';
import type { DevisInput, LigneDevisInput } from '@/lib/validation/commercial';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// clientId UUID valide + une ligne libre valide → la validation Zod passe et la
// soumission atteint réellement `handleSubmit` (sinon `handleInvalid` court-circuite
// et le bouton n'entre jamais dans l'état « Enregistrement… »).
const DEFAULTS: Partial<DevisInput> = {
  clientId: '11111111-1111-4111-8111-111111111111',
  lignes: [
    {
      type: 'libre',
      articleId: null,
      designation: 'Ligne A',
      quantite: '1',
      unite: 'u',
      prixUnitaireHt: '100',
      tauxTva: '20.00',
      remisePourcent: '0',
      notes: null,
      composants: [],
      origineDpgf: false,
    } as LigneDevisInput,
  ],
};

describe('DevisEditor — robustesse de la soumission', () => {
  afterEach(() => cleanup());

  it('débloque le bouton et affiche l’erreur quand l’action serveur lève (plus de blocage « Enregistrement… »)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom serveur'));

    render(
      <DevisEditor
        clients={[]}
        articles={[]}
        unites={[]}
        defaultValues={DEFAULTS}
        onSubmit={onSubmit}
        successRedirect="/devis"
        workflowStatutCourant="brouillon"
        peutGererPostesInternes={false}
      />,
    );

    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer le devis' }).closest('form')!);

    // L'action a bien été appelée…
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // …et malgré le rejet, l'UI se rétablit : l'erreur est surfacée et le bouton
    // redevient cliquable (libellé « Enregistrer le devis », non désactivé).
    await waitFor(() =>
      expect(
        screen.getByText(/Erreur lors de l'enregistrement : boom serveur/),
      ).toBeInTheDocument(),
    );
    const boutonApres = screen.getByRole('button', { name: 'Enregistrer le devis' });
    expect(boutonApres).toBeEnabled();
  });

  it('affiche le message d’erreur métier quand l’action renvoie { ok: false }', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: 'Devis introuvable.' });

    render(
      <DevisEditor
        clients={[]}
        articles={[]}
        unites={[]}
        defaultValues={DEFAULTS}
        onSubmit={onSubmit}
        successRedirect="/devis"
        workflowStatutCourant="brouillon"
        peutGererPostesInternes={false}
      />,
    );

    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer le devis' }).closest('form')!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Devis introuvable.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Enregistrer le devis' })).toBeEnabled();
  });
});
