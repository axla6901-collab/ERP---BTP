import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AvisSection } from '@/components/test-sirh/recrutement/avis-section';
import type { AvisLigne } from '@/lib/test-sirh/recrutement/queries';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CANDIDATURE = 'c2222222-2222-4222-8222-222222222222';

const avis: AvisLigne[] = [
  {
    id: 'a1',
    candidatureId: CANDIDATURE,
    auteurId: 'moi',
    auteurLibelle: 'chef@acme.fr',
    note: 3,
    avis: 'reserve',
    commentaire: 'À revoir en entretien technique.',
    createdAt: '2026-10-15T09:00:00.000Z',
  },
  {
    id: 'a2',
    candidatureId: CANDIDATURE,
    auteurId: 'autre',
    auteurLibelle: 'rh@acme.fr',
    note: 5,
    avis: 'favorable',
    commentaire: null,
    createdAt: '2026-10-16T09:00:00.000Z',
  },
];

function rendre(peutGerer: boolean, liste = avis) {
  const onAjouter = vi.fn().mockResolvedValue({ ok: true, data: { id: 'a3' } });
  const onSupprimer = vi.fn().mockResolvedValue({ ok: true, data: undefined });
  render(
    <AvisSection
      candidatureId={CANDIDATURE}
      avis={liste}
      utilisateurId="moi"
      peutGerer={peutGerer}
      onAjouter={onAjouter}
      onSupprimer={onSupprimer}
    />,
  );
  return { onAjouter, onSupprimer };
}

describe('AvisSection', () => {
  it('liste les avis (« Vous » pour les siens, note et commentaire)', () => {
    rendre(false);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByText('Réservé')).toBeInTheDocument();
    expect(within(items[0]!).getByText(/^Vous · 15\/10\/2026$/)).toBeInTheDocument();
    expect(
      within(items[0]!).getByRole('img', { name: 'Note de l’avis : 3 sur 5' }),
    ).toBeInTheDocument();
    expect(within(items[0]!).getByText('À revoir en entretien technique.')).toBeInTheDocument();
    expect(within(items[1]!).getByText(/rh@acme\.fr/)).toBeInTheDocument();
  });

  it('un évaluateur ne supprime que ses propres avis', () => {
    rendre(false);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(within(items[1]!).queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('la gestion RH peut supprimer tous les avis', async () => {
    const { onSupprimer } = rendre(true);
    expect(screen.getAllByRole('button', { name: 'Supprimer' })).toHaveLength(2);
    const items = screen.getAllByRole('listitem');
    fireEvent.click(within(items[1]!).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(items[1]!).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(onSupprimer).toHaveBeenCalledWith('a2'));
  });

  it('ajoute un avis : appréciation, note en étoiles et commentaire', async () => {
    const { onAjouter } = rendre(false, []);
    expect(screen.getByText('Aucun avis pour l’instant.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Défavorable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ma note : 2 sur 5' }));
    fireEvent.change(screen.getByLabelText('Commentaire'), {
      target: { value: 'Pas de CACES R482.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter mon avis' }));
    await waitFor(() =>
      expect(onAjouter).toHaveBeenCalledWith({
        candidatureId: CANDIDATURE,
        note: 2,
        avis: 'defavorable',
        commentaire: 'Pas de CACES R482.',
      }),
    );
  });
});
