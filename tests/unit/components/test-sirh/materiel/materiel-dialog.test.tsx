import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  MaterielDialog,
  valeursMaterielParDefaut,
  type MaterielEditable,
} from '@/components/test-sirh/materiel/materiel-dialog';

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

const ID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

const attribue: MaterielEditable = {
  id: ID,
  categorie: 'informatique',
  libelle: 'Ordinateur portable',
  marque: 'Lenovo',
  modele: 'T14',
  numeroSerie: 'SN-42',
  taille: null,
  dateAchat: '2025-03-01',
  valeurAchat: 1200,
  dateFinGarantie: '2028-03-01',
  dateControle: null,
  statut: 'attribue',
  notes: null,
};

describe('MaterielDialog', () => {
  it('valeurs par défaut : EPI en stock', () => {
    expect(valeursMaterielParDefaut(null)).toMatchObject({
      categorie: 'epi',
      statut: 'en_stock',
      valeurAchat: null,
    });
    expect(valeursMaterielParDefaut(attribue).valeurAchat).toBe('1200.00');
  });

  it('ajoute un matériel', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: ID } });
    render(<MaterielDialog open onOpenChange={vi.fn()} materiel={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Gants anti-coupure' } });
    fireEvent.change(screen.getByLabelText('Taille'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText(/valeur d’achat/i), { target: { value: '12,50' } });
    fireEvent.change(screen.getByLabelText(/prochain contrôle/i), {
      target: { value: '2027-04-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          categorie: 'epi',
          libelle: 'Gants anti-coupure',
          taille: '9',
          valeurAchat: '12.50',
          dateControle: '2027-04-01',
          statut: 'en_stock',
        }),
      ),
    );
  });

  it('refuse un libellé vide', async () => {
    const onSubmit = vi.fn();
    render(<MaterielDialog open onOpenChange={vi.fn()} materiel={null} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Libellé requis.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('verrouille le statut d’un matériel attribué', () => {
    render(<MaterielDialog open onOpenChange={vi.fn()} materiel={attribue} onSubmit={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: 'Statut' })).toHaveAttribute('data-disabled');
    expect(screen.getByText(/utilisez « restituer »/i)).toBeInTheDocument();
  });

  it('affiche l’erreur d’unicité du numéro de série', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Un matériel porte déjà ce numéro de série.',
      fieldErrors: { numeroSerie: ['Un matériel porte déjà ce numéro de série.'] },
    });
    render(<MaterielDialog open onOpenChange={vi.fn()} materiel={attribue} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(screen.getAllByText('Un matériel porte déjà ce numéro de série.')).toHaveLength(2),
    );
  });
});
