import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

const relancerTiersEnMasse = vi.fn(async () => ({
  ok: true as const,
  data: { envoyees: 1, ignores: 0 },
}));
const relancerTier = vi.fn(async () => ({ ok: true as const, data: { niveau: 'r1' as const } }));
vi.mock('@/lib/referencement/relances', () => ({
  relancerTiersEnMasse: (...args: unknown[]) => relancerTiersEnMasse(...(args as [])),
  relancerTier: (...args: unknown[]) => relancerTier(...(args as [])),
}));

import { ReferencementListe } from '@/components/referencement/referencement-liste';
import type { TierConformiteRow } from '@/lib/referencement/registre';

const A_RELANCER: TierConformiteRow = {
  id: 'tier-1',
  code: 'ELEC-DURAND',
  nom: 'Durand Élec',
  natureTiers: 'artisan',
  siret: '12345678900011',
  statutAgrement: 'en_attente_documents',
  classe: 'a_relancer',
  nbProblemes: 1,
  nbDocumentsRequis: 3,
  lignes: [
    {
      natureDocumentId: 'n1',
      code: 'KBIS',
      libelle: 'K-bis',
      estBloquant: true,
      statut: 'manquant',
      dateFinValidite: null,
    },
  ],
  derniereRelanceLe: null,
};

const A_JOUR: TierConformiteRow = {
  id: 'tier-2',
  code: 'PLOMB-MARTIN',
  nom: 'Martin Plomberie',
  natureTiers: 'artisan',
  siret: '98765432100022',
  statutAgrement: 'agree',
  classe: 'a_jour',
  nbProblemes: 0,
  nbDocumentsRequis: 2,
  lignes: [],
  derniereRelanceLe: '2026-06-01T10:00:00.000Z',
};

describe('ReferencementListe', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('répartit les tiers entre les deux chevrons (à relancer / à jour)', () => {
    render(<ReferencementListe slug="default" tiers={[A_RELANCER, A_JOUR]} peutRelancer />);
    expect(screen.getByText('À relancer (1)')).toBeInTheDocument();
    expect(screen.getByText('À jour (1)')).toBeInTheDocument();
    expect(screen.getByText('Durand Élec')).toBeInTheDocument();
    expect(screen.getByText('Martin Plomberie')).toBeInTheDocument();
  });

  it('affiche le SIREN (9 premiers chiffres du SIRET)', () => {
    render(<ReferencementListe slug="default" tiers={[A_RELANCER]} peutRelancer />);
    expect(screen.getByText('123456789')).toBeInTheDocument();
  });

  it('active la relance en masse après sélection d’une ligne', () => {
    render(<ReferencementListe slug="default" tiers={[A_RELANCER]} peutRelancer />);
    // Pas de bouton de masse tant que rien n'est coché.
    expect(screen.queryByText(/Relancer la sélection/)).not.toBeInTheDocument();
    // Coche la ligne (la 1re checkbox est le "tout sélectionner").
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[checkboxes.length - 1]!);
    expect(screen.getByText('Relancer la sélection (1)')).toBeInTheDocument();
  });

  it('masque les cases à cocher si l’utilisateur ne peut pas relancer', () => {
    render(<ReferencementListe slug="default" tiers={[A_RELANCER]} peutRelancer={false} />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('appelle relancerTiersEnMasse avec les tiers sélectionnés', async () => {
    render(<ReferencementListe slug="default" tiers={[A_RELANCER]} peutRelancer />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[checkboxes.length - 1]!);
    fireEvent.click(screen.getByText('Relancer la sélection (1)'));
    expect(relancerTiersEnMasse).toHaveBeenCalledWith(['tier-1']);
  });
});
