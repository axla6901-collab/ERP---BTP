import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  HeuresSupValidationListe,
  type HeuresSupAValider,
} from '@/components/test-sirh/temps/heures-sup-validation-liste';

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

const ID1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const ID2 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f71';

const demandes: HeuresSupAValider[] = [
  {
    id: ID1,
    employeNom: 'Martin',
    employePrenom: 'Paul',
    matricule: 'M001',
    dateHeures: '2026-10-12',
    dureeHeures: 2.5,
    majorationPct: 25,
    compensation: 'paiement',
    chantierLabel: 'CH-12 · Résidence Les Tilleuls',
    motif: 'Coulage dalle',
    demandeParEmail: 'chef@exemple.fr',
    peutDecider: true,
  },
  {
    id: ID2,
    employeNom: 'Durand',
    employePrenom: 'Léa',
    matricule: null,
    dateHeures: '2026-10-13',
    dureeHeures: 1,
    majorationPct: 50,
    compensation: 'recuperation',
    chantierLabel: null,
    motif: null,
    demandeParEmail: null,
    peutDecider: false,
  },
];

describe('HeuresSupValidationListe', () => {
  it('liste les demandes en attente', () => {
    render(<HeuresSupValidationListe demandes={demandes} onDecider={vi.fn()} />);
    expect(screen.getByText('Martin Paul')).toBeInTheDocument();
    expect(screen.getByText('12/10/2026')).toBeInTheDocument();
    expect(screen.getByText('2 h 30')).toBeInTheDocument();
    expect(screen.getByText('+25 %')).toBeInTheDocument();
    expect(screen.getByText('Récupération')).toBeInTheDocument();
    expect(screen.getByText('Demandée par chef@exemple.fr')).toBeInTheDocument();
  });

  it('désactive la décision sur sa propre demande', () => {
    render(<HeuresSupValidationListe demandes={demandes} onDecider={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Approuver la demande de Léa Durand' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Approuver la demande de Paul Martin' }),
    ).toBeEnabled();
  });

  it('approuve avec un commentaire optionnel', async () => {
    const onDecider = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(<HeuresSupValidationListe demandes={demandes} onDecider={onDecider} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approuver la demande de Paul Martin' }));
    expect(await screen.findByText('Approuver la demande')).toBeInTheDocument();
    expect(screen.getByText('Martin Paul — 12/10/2026 — 2 h 30 (+25 %)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approuver' }));
    await waitFor(() =>
      expect(onDecider).toHaveBeenCalledWith({ id: ID1, decision: 'approuver', commentaire: null }),
    );
  });

  it('refuse avec un motif', async () => {
    const onDecider = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(<HeuresSupValidationListe demandes={demandes} onDecider={onDecider} />);
    fireEvent.click(screen.getByRole('button', { name: 'Refuser la demande de Paul Martin' }));
    fireEvent.change(await screen.findByLabelText('Motif du refus'), {
      target: { value: 'Non prévu au planning' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    await waitFor(() =>
      expect(onDecider).toHaveBeenCalledWith({
        id: ID1,
        decision: 'refuser',
        commentaire: 'Non prévu au planning',
      }),
    );
  });

  it('affiche l’état vide', () => {
    render(<HeuresSupValidationListe demandes={[]} onDecider={vi.fn()} />);
    expect(screen.getByText(/aucune demande d’heures supplémentaires/i)).toBeInTheDocument();
  });
});
