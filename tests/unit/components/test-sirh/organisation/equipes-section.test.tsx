import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EquipesSection,
  type EquipeLigneUI,
} from '@/components/test-sirh/organisation/equipes-section';
import type { MembreLigne } from '@/components/test-sirh/organisation/membres-equipe-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const UUID_EQUIPE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const TODAY = '2026-10-19';

const actions = {
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  enregistrerMembre: vi.fn().mockResolvedValue({ ok: true, data: { id: 'm' } }),
  retirerMembre: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

const equipes: EquipeLigneUI[] = [
  {
    id: UUID_EQUIPE,
    nom: 'Gros œuvre Lyon',
    description: 'Équipe maçonnerie',
    responsableId: 'e1',
    responsableNom: 'Marc Dubois',
    siteId: 's1',
    siteNom: 'Agence de Lyon',
    couleur: '#0ea5e9',
    actif: true,
    effectif: 4,
  },
  {
    id: 'eq2',
    nom: 'Ancienne équipe',
    description: null,
    responsableId: null,
    responsableNom: null,
    siteId: null,
    siteNom: null,
    couleur: '#f59e0b',
    actif: false,
    effectif: 0,
  },
];

const membres: MembreLigne[] = [
  {
    id: 'm1',
    equipeId: UUID_EQUIPE,
    employeId: 'e1',
    employeNom: 'Marc Dubois',
    employeActif: true,
    estResponsable: true,
    dateDebut: '2024-01-01',
    dateFin: null,
  },
  {
    id: 'm2',
    equipeId: UUID_EQUIPE,
    employeId: 'e2',
    employeNom: 'Léa Martin',
    employeActif: true,
    estResponsable: false,
    dateDebut: '2025-01-01',
    dateFin: '2025-12-31',
  },
];

const employes = [
  { id: 'e1', label: 'Dubois Marc', actif: true },
  { id: 'e2', label: 'Martin Léa', actif: true },
];

function rendre(peutGerer = true) {
  return render(
    <EquipesSection
      equipes={equipes}
      membres={membres}
      employes={employes}
      sites={[{ id: 's1', label: 'Agence de Lyon' }]}
      peutGerer={peutGerer}
      today={TODAY}
      actions={actions}
    />,
  );
}

describe('EquipesSection', () => {
  it('affiche les équipes : responsable, site, effectif et statut', () => {
    rendre();
    expect(screen.getByText('Gros œuvre Lyon')).toBeInTheDocument();
    expect(screen.getByText('Équipe maçonnerie')).toBeInTheDocument();
    expect(screen.getByText('Marc Dubois')).toBeInTheDocument();
    expect(screen.getByText('Agence de Lyon')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nouvelle équipe/i })).toBeInTheDocument();
  });

  it('en lecture seule : membres consultables, pas de gestion', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /nouvelle équipe/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Membres de Gros œuvre Lyon' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Léa Martin')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Ajouter un membre')).not.toBeInTheDocument();
  });

  it('dialogue des membres : rôle, période et statut (actif / terminé)', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Membres de Gros œuvre Lyon' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Responsable')).toBeInTheDocument();
    expect(within(dialog).getByText('Depuis le 01/01/2024')).toBeInTheDocument();
    expect(within(dialog).getByText('01/01/2025 → 31/12/2025')).toBeInTheDocument();
    expect(within(dialog).getByText('Actif')).toBeInTheDocument();
    expect(within(dialog).getByText('Terminé')).toBeInTheDocument();
    expect(within(dialog).getByText('Ajouter un membre')).toBeInTheDocument();
  });

  it('retire un membre après confirmation', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Membres de Gros œuvre Lyon' }));
    const dialog = screen.getByRole('dialog');
    // Membres triés : actifs d'abord → le premier « Retirer » est celui de Marc Dubois (m1).
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Retirer' })[0]!);
    const question = within(dialog).getByText('Retirer ce membre ?');
    fireEvent.click(within(question.parentElement!).getByRole('button', { name: 'Retirer' }));
    await waitFor(() => expect(actions.retirerMembre).toHaveBeenCalledWith('m1'));
  });

  it('crée une équipe avec la couleur par défaut et l’aperçu', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle équipe/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nom'), {
      target: { value: 'Second œuvre' },
    });
    expect(within(dialog).getByTestId('apercu-equipe')).toHaveTextContent('Second œuvre');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer l’équipe' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          nom: 'Second œuvre',
          couleur: '#f59e0b',
          actif: true,
          responsableId: null,
          siteId: null,
        }),
      ),
    );
  });

  it('refuse une couleur invalide côté client', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle équipe/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Nom'), { target: { value: 'Test' } });
    fireEvent.change(within(dialog).getByLabelText('Couleur'), { target: { value: 'rouge' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer l’équipe' }));
    expect(await within(dialog).findByText('Couleur invalide (#RRGGBB).')).toBeInTheDocument();
    expect(actions.enregistrer).not.toHaveBeenCalled();
  });

  it('demande confirmation puis supprime une équipe', async () => {
    rendre();
    // Tri par nom : « Ancienne équipe » (eq2) est la première ligne.
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]!);
    const question = screen.getByText('Supprimer cette équipe ?');
    fireEvent.click(within(question.parentElement!).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith('eq2'));
  });
});
